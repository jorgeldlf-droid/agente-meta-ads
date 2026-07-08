import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { baixarPdfLocal } from '../extratorPdf.js';
import { renderizarPaginasPdf } from '../renderizadorPaginas.js';
import { gerarPastaSaidaSlug } from '../gerarPastaSaidaSlug.js';
import { obterFornecedorPorSlug } from '../registroFornecedores.js';
import { VERSAO_EXTRATOR_PRODUTO } from './normalizarProdutoComercial.js';
import { extrairTextoPaginaPdf } from './extrairTextoPaginaPdf.js';
import { classificarPaginaProduto, paginaEhComercial } from './classificarPaginaProduto.js';
import { extrairProdutoPagina } from './extrairProdutoPagina.js';
import {
  persistirProdutosCatalogo,
  resolverRelacionamentosComerciais,
} from './persistirProdutosCatalogo.js';

dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const SERVICE_DIR = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_AUDITORIA_DIR = path.join(SERVICE_DIR, 'output', 'auditoria-produtos');

const TIPOS_PAGINA_TECNICA = new Set(['especificacoes', 'tabela']);
const MOTIVO_PAGINA_TECNICA_SEM_IDENTIDADE = 'Página técnica sem identidade de produto confiável';

const ROTULOS_TECNICOS_FRACOS = new Set([
  'rev',
  'tp',
  'a',
  'de uso',
  'atencao',
  'obs',
  'aviso',
  'uso',
  'indicacao de uso',
  'especificacoes',
  'ficha tecnica',
  'importante',
  'nota',
  'informacao',
]);

function criarEstatisticas() {
  return {
    paginas_processadas: 0,
    paginas_produto: 0,
    paginas_ambiente: 0,
    paginas_tabela: 0,
    paginas_especificacoes: 0,
    paginas_outros: 0,
    produtos_validos: 0,
    produtos_invalidos: 0,
    vision_utilizada: 0,
    vision_cache: 0,
    vision_pulada: 0,
    texto_pdf: 0,
    texto_insuficiente: 0,
    completude_media_percentual: 0,
  };
}

function registrarTipoPagina(stats, tipo) {
  if (tipo === 'produto') stats.paginas_produto += 1;
  else if (tipo === 'ambiente') stats.paginas_ambiente += 1;
  else if (tipo === 'tabela') stats.paginas_tabela += 1;
  else if (tipo === 'especificacoes') stats.paginas_especificacoes += 1;
  else stats.paginas_outros += 1;
}

function registrarFonteVision(stats, fonte) {
  if (fonte === 'vision') stats.vision_utilizada += 1;
  else if (fonte === 'vision_cache') stats.vision_cache += 1;
  else if (fonte === 'vision_pulada') stats.vision_pulada += 1;
}

function calcularCompletudeMedia(completudes = []) {
  if (completudes.length === 0) return 0;
  const soma = completudes.reduce((acc, c) => acc + (c.percentual_completude || 0), 0);
  return Math.round(soma / completudes.length);
}

function normalizarNomeComparacao(nome = '') {
  return String(nome || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function ehRotuloTecnicoFraco(nome = '') {
  const normalizado = normalizarNomeComparacao(nome);
  if (!normalizado) return true;
  if (ROTULOS_TECNICOS_FRACOS.has(normalizado)) return true;
  if (normalizado.length <= 2) return true;
  if (normalizado.length <= 3 && !normalizado.includes('-')) return true;
  return false;
}

export function nomeProdutoForteEmPaginaTecnica(nome = '') {
  const texto = String(nome || '').trim();
  if (!texto || ehRotuloTecnicoFraco(texto)) return false;

  const semEspacos = texto.replace(/\s/g, '');
  if (/^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ0-9]{3,}(?:-[A-Z0-9]{1,})+$/i.test(semEspacos)) {
    return true;
  }

  const ehCaixaAlta = texto === texto.toUpperCase() && /[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ]/.test(texto);
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (ehCaixaAlta && palavras.length >= 2 && texto.length > 8) {
    return true;
  }

  return false;
}

function paginaTecnicaSemIdentidade(classificacao = {}, produtoNormalizado = {}) {
  if (!TIPOS_PAGINA_TECNICA.has(classificacao.tipo)) return false;
  return !nomeProdutoForteEmPaginaTecnica(produtoNormalizado.nome_produto);
}

function obterArg(prefixo) {
  const flag = process.argv.find((a) => a.startsWith(`${prefixo}=`));
  if (flag) return flag.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  const idx = process.argv.indexOf(prefixo);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function obterFlag(nome) {
  return process.argv.includes(nome);
}

function logPaginaResumo(pagina, classificacao, extracao) {
  console.log(`\nPágina ${pagina}`);
  console.log(`Tipo:\n${classificacao.tipo}`);
  console.log(`Confiança:\n${classificacao.confianca}`);

  if (!extracao) return;

  if (extracao.motivo_ignorado) {
    console.log(`Ignorado:\n${extracao.motivo_ignorado}`);
    return;
  }

  const p = extracao.produto_normalizado;
  const v = extracao.validacao;
  const c = extracao.completude;

  console.log('Produto encontrado');
  console.log(`Linha:\n${p.linha_produto || '(não identificado)'}`);
  console.log(`Coleção:\n${p.colecao || '(não identificado)'}`);
  console.log(`Produto:\n${p.nome_produto || '(não identificado)'}`);
  console.log(`Formato:\n${p.formato || '(não identificado)'}`);
  console.log(`Espessura:\n${p.espessura || '(não identificado)'}`);
  console.log(`Acabamento:\n${p.acabamento || '(não identificado)'}`);
  console.log(`Visual:\n${p.visual || '(não identificado)'}`);
  console.log(`Cor:\n${p.cor || '(não identificado)'}`);
  console.log(`Uso:\n${p.uso || '(não identificado)'}`);
  console.log(`Categoria:\n${p.categoria || '(não identificado)'}`);
  console.log(`Completude:\n${c.percentual_completude}% (${c.campos_extraidos}/${c.campos_extraidos + c.campos_vazios})`);
  console.log(`Validação:\n${v.valido ? 'OK' : v.erros.join('; ')}`);
}

export async function extrairProdutosCatalogo({
  fornecedorSlug,
  nomePdf,
  maxPaginas = 50,
  pdfLocalPath = null,
  persistir = false,
}) {
  const inicioMs = Date.now();
  const stats = criarEstatisticas();
  const completudesExtraidas = [];

  const fornecedor = obterFornecedorPorSlug(fornecedorSlug);
  if (!fornecedor) throw new Error(`Fornecedor slug inválido: ${fornecedorSlug}`);

  const nomeCatalogo = path.basename(nomePdf, '.pdf');
  const pastaSaidaSlug = gerarPastaSaidaSlug(nomeCatalogo);
  const pdfPath = pdfLocalPath || await baixarPdfLocal(fornecedorSlug, nomePdf);
  const paginas = await renderizarPaginasPdf(pdfPath, pastaSaidaSlug, maxPaginas);

  const relatorio = {
    fornecedor: fornecedor.nome,
    catalogo: nomeCatalogo,
    versao_extrator: VERSAO_EXTRATOR_PRODUTO,
    paginas_processadas: paginas.length,
    produtos_encontrados: 0,
    produtos: [],
    erros: [],
    tempo_processamento_ms: 0,
    estatisticas: stats,
  };

  for (const pag of paginas) {
    stats.paginas_processadas += 1;

    try {
      const textoPagina = await extrairTextoPaginaPdf(pdfPath, pag.numero);
      if (textoPagina.textoSuficiente) stats.texto_pdf += 1;
      else stats.texto_insuficiente += 1;

      const classificacao = await classificarPaginaProduto({
        texto: textoPagina.texto,
        caminhoImagem: pag.caminhoLocal,
      });

      registrarTipoPagina(stats, classificacao.tipo);
      registrarFonteVision(stats, classificacao.fonte);

      if (!paginaEhComercial(classificacao)) {
        logPaginaResumo(pag.numero, classificacao, null);
        continue;
      }

      const extracao = await extrairProdutoPagina({
        pagina: pag.numero,
        caminhoImagem: pag.caminhoLocal,
        texto: textoPagina.texto,
        textoSuficiente: textoPagina.textoSuficiente,
        avisoOcr: textoPagina.avisoOcr,
      });

      registrarFonteVision(stats, extracao.vision_fonte);
      completudesExtraidas.push(extracao.completude);

      const item = {
        pagina: pag.numero,
        classificacao,
        produto_extraido: extracao.produto_extraido,
        produto_normalizado: extracao.produto_normalizado,
        validacao: extracao.validacao,
        completude: extracao.completude,
      };

      if (paginaTecnicaSemIdentidade(classificacao, extracao.produto_normalizado)) {
        logPaginaResumo(pag.numero, classificacao, {
          ...extracao,
          motivo_ignorado: MOTIVO_PAGINA_TECNICA_SEM_IDENTIDADE,
        });

        relatorio.erros.push({
          ...item,
          motivo: MOTIVO_PAGINA_TECNICA_SEM_IDENTIDADE,
        });
        stats.produtos_invalidos += 1;
        continue;
      }

      logPaginaResumo(pag.numero, classificacao, extracao);

      if (extracao.validacao.valido) {
        relatorio.produtos.push(item);
        relatorio.produtos_encontrados += 1;
        stats.produtos_validos += 1;
      } else {
        relatorio.erros.push({
          pagina: pag.numero,
          classificacao,
          produto_extraido: extracao.produto_extraido,
          produto_normalizado: extracao.produto_normalizado,
          validacao: extracao.validacao,
          completude: extracao.completude,
        });
        stats.produtos_invalidos += 1;
      }
    } catch (error) {
      relatorio.erros.push({ pagina: pag.numero, erros: [error.message] });
    }
  }

  stats.completude_media_percentual = calcularCompletudeMedia(completudesExtraidas);
  relatorio.tempo_processamento_ms = Date.now() - inicioMs;

  if (!fs.existsSync(OUTPUT_AUDITORIA_DIR)) {
    fs.mkdirSync(OUTPUT_AUDITORIA_DIR, { recursive: true });
  }

  const arquivoSaida = path.join(OUTPUT_AUDITORIA_DIR, `${pastaSaidaSlug}.json`);
  fs.writeFileSync(arquivoSaida, JSON.stringify(relatorio, null, 2), 'utf8');

  console.log(`\n📄 Auditoria salva em: ${arquivoSaida}`);
  console.log(`⏱️ Tempo: ${relatorio.tempo_processamento_ms}ms`);
  console.log(`📊 Completude média: ${stats.completude_media_percentual}%`);

  if (persistir) {
    console.log('\nPersistindo produtos válidos...');
    try {
      const relacionamentos = await resolverRelacionamentosComerciais({
        fornecedorSlug,
        nomeCatalogo,
      });

      const resumoPersistencia = await persistirProdutosCatalogo({
        catalogoId: relacionamentos.catalogo_id,
        fornecedorId: relacionamentos.fornecedor_id,
        produtos: relatorio.produtos,
      });

      relatorio.persistencia = {
        persistidos: resumoPersistencia.persistidos,
        ignorados: resumoPersistencia.ignorados,
        erros: resumoPersistencia.erros,
        tempo_ms: resumoPersistencia.tempo_ms,
        catalogo_id: relacionamentos.catalogo_id,
        fornecedor_id: relacionamentos.fornecedor_id,
        catalogo: relacionamentos.catalogo,
        fornecedor: relacionamentos.fornecedor,
      };

      console.log(`Produtos persistidos: ${resumoPersistencia.persistidos}`);
      console.log(`Produtos ignorados: ${resumoPersistencia.ignorados}`);

      if (resumoPersistencia.erros.length > 0) {
        console.log(`Erros na persistência: ${resumoPersistencia.erros.length}`);
      }
    } catch (error) {
      relatorio.persistencia = {
        persistidos: 0,
        ignorados: 0,
        erros: [{ erros: [error.message] }],
        tempo_ms: 0,
      };
      console.error(`❌ Falha na persistência: ${error.message}`);
    }
  } else {
    console.log('Nenhum dado foi gravado no banco.');
  }

  return relatorio;
}

async function main() {
  const fornecedorSlug = obterArg('--fornecedor');
  const nomePdf = obterArg('--pdf');
  const maxPaginas = Number(obterArg('--max-paginas') || 50);
  const pdfLocal = obterArg('--pdf-local');
  const persistir = obterFlag('--persistir');

  if (!fornecedorSlug || (!nomePdf && !pdfLocal)) {
    console.error(
      'Uso: node src/inteligencia-comercial/extrairProdutosCatalogo.js --fornecedor=delta --pdf="Delta Evidence 35x70.pdf" [--persistir]'
    );
    process.exit(1);
  }

  await extrairProdutosCatalogo({
    fornecedorSlug: fornecedorSlug.toLowerCase(),
    nomePdf: nomePdf || path.basename(pdfLocal),
    maxPaginas,
    pdfLocalPath: pdfLocal,
    persistir,
  });
}

const ehExecucaoDireta = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ehExecucaoDireta) {
  main().catch((err) => {
    console.error('❌ Falha na auditoria comercial:', err.message);
    process.exit(1);
  });
}
