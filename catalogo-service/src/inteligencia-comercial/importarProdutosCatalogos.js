import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { supabase } from '../supabaseClient.js';
import { extrairProdutosCatalogo } from './extrairProdutosCatalogo.js';

dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const SERVICE_DIR = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_AUDITORIA_DIR = path.join(SERVICE_DIR, 'output', 'auditoria-produtos');

function criarResumoImportacao() {
  return {
    inicio_em: new Date().toISOString(),
    dry_run: false,
    catalogos_encontrados: 0,
    processados: 0,
    ignorados: 0,
    erros: 0,
    produtos_encontrados: 0,
    produtos_persistidos: 0,
    tempo_total_ms: 0,
    tempo_medio_ms: 0,
    itens: [],
  };
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

function garantirSupabase() {
  if (!supabase) {
    throw new Error(
      'Cliente Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}

async function buscarFornecedores() {
  garantirSupabase();
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome, slug');

  if (error) {
    throw new Error(`Erro ao buscar fornecedores: ${error.message}`);
  }

  return data || [];
}

function montarMapaFornecedores(fornecedores = []) {
  const mapa = new Map();
  for (const fornecedor of fornecedores) {
    mapa.set(fornecedor.id, fornecedor);
  }
  return mapa;
}

async function buscarCatalogos({ fornecedorId = null, maxCatalogos = null } = {}) {
  garantirSupabase();
  let query = supabase
    .from('catalogos')
    .select('id, nome, arquivo_pdf, fornecedor_id')
    .order('id', { ascending: true });

  if (fornecedorId != null) {
    query = query.eq('fornecedor_id', fornecedorId);
  }

  if (Number.isFinite(maxCatalogos) && maxCatalogos > 0) {
    query = query.limit(maxCatalogos);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar catálogos: ${error.message}`);
  }

  return data || [];
}

function validarCatalogosParaProcessamento(catalogos, mapaFornecedores) {
  const itensValidos = [];
  const itensIgnorados = [];
  const chavesArquivo = new Map();

  for (const catalogo of catalogos) {
    const fornecedor = mapaFornecedores.get(catalogo.fornecedor_id) || null;
    const arquivoPdf = String(catalogo.arquivo_pdf || '').trim();
    const fornecedorSlug = String(fornecedor?.slug || '').trim().toLowerCase();

    if (!arquivoPdf) {
      itensIgnorados.push({
        catalogo_id: catalogo.id,
        nome: catalogo.nome,
        arquivo_pdf: catalogo.arquivo_pdf,
        fornecedor_slug: fornecedorSlug || null,
        fornecedor_nome: fornecedor?.nome || null,
        status: 'ignorado',
        motivo: 'arquivo_pdf vazio ou ausente.',
      });
      continue;
    }

    if (!fornecedor) {
      itensIgnorados.push({
        catalogo_id: catalogo.id,
        nome: catalogo.nome,
        arquivo_pdf: arquivoPdf,
        fornecedor_slug: null,
        fornecedor_nome: null,
        status: 'ignorado',
        motivo: `Fornecedor não encontrado (fornecedor_id=${catalogo.fornecedor_id}).`,
      });
      continue;
    }

    if (!fornecedorSlug) {
      itensIgnorados.push({
        catalogo_id: catalogo.id,
        nome: catalogo.nome,
        arquivo_pdf: arquivoPdf,
        fornecedor_slug: null,
        fornecedor_nome: fornecedor.nome || null,
        status: 'ignorado',
        motivo: 'Fornecedor sem slug no banco.',
      });
      continue;
    }

    const chaveDuplicidade = `${fornecedorSlug}::${arquivoPdf}`;
    if (chavesArquivo.has(chaveDuplicidade)) {
      const anterior = chavesArquivo.get(chaveDuplicidade);
      itensIgnorados.push({
        catalogo_id: catalogo.id,
        nome: catalogo.nome,
        arquivo_pdf: arquivoPdf,
        fornecedor_slug: fornecedorSlug,
        fornecedor_nome: fornecedor.nome || null,
        status: 'ignorado',
        motivo: `Duplicidade de arquivo_pdf no lote (conflito com catalogo_id=${anterior.catalogo_id}).`,
      });
      continue;
    }

    chavesArquivo.set(chaveDuplicidade, { catalogo_id: catalogo.id });

    itensValidos.push({
      catalogo_id: catalogo.id,
      nome: catalogo.nome,
      arquivo_pdf: arquivoPdf,
      fornecedor_slug: fornecedorSlug,
      fornecedor_nome: fornecedor.nome || null,
    });
  }

  return { itensValidos, itensIgnorados };
}

function salvarResumoImportacao(resumo) {
  if (!fs.existsSync(OUTPUT_AUDITORIA_DIR)) {
    fs.mkdirSync(OUTPUT_AUDITORIA_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arquivoSaida = path.join(OUTPUT_AUDITORIA_DIR, `importacao-lote-${timestamp}.json`);
  fs.writeFileSync(arquivoSaida, JSON.stringify(resumo, null, 2), 'utf8');
  return arquivoSaida;
}

function imprimirResumoFinal(resumo) {
  console.log('\n📊 Resumo da importação em lote');
  console.log(`Catálogos encontrados: ${resumo.catalogos_encontrados}`);
  console.log(`Processados: ${resumo.processados}`);
  console.log(`Ignorados: ${resumo.ignorados}`);
  console.log(`Erros: ${resumo.erros}`);
  console.log(`Produtos encontrados: ${resumo.produtos_encontrados}`);
  console.log(`Produtos persistidos: ${resumo.produtos_persistidos}`);
  console.log(`⏱️ Tempo total: ${resumo.tempo_total_ms}ms`);
  console.log(`⏱️ Tempo médio por catálogo: ${resumo.tempo_medio_ms}ms`);
}

export async function importarProdutosCatalogos({
  fornecedorSlug = null,
  maxCatalogos = null,
  maxPaginas = 50,
  dryRun = false,
} = {}) {
  const inicioMs = Date.now();
  const resumo = criarResumoImportacao();
  resumo.dry_run = dryRun;

  const slugFiltro = fornecedorSlug ? String(fornecedorSlug).trim().toLowerCase() : null;

  const fornecedores = await buscarFornecedores();
  const mapaFornecedores = montarMapaFornecedores(fornecedores);

  let fornecedorIdFiltro = null;
  if (slugFiltro) {
    const fornecedorAlvo = fornecedores.find(
      (f) => String(f.slug || '').trim().toLowerCase() === slugFiltro
    );
    if (!fornecedorAlvo) {
      resumo.tempo_total_ms = Date.now() - inicioMs;
      const arquivoSaida = salvarResumoImportacao(resumo);
      console.log(`\n⚠️ Nenhum fornecedor com slug "${slugFiltro}" encontrado.`);
      console.log(`📄 Resumo salvo em: ${arquivoSaida}`);
      return resumo;
    }
    fornecedorIdFiltro = fornecedorAlvo.id;
  }

  const catalogos = await buscarCatalogos({
    fornecedorId: fornecedorIdFiltro,
    maxCatalogos,
  });
  resumo.catalogos_encontrados = catalogos.length;

  const { itensValidos, itensIgnorados } = validarCatalogosParaProcessamento(
    catalogos,
    mapaFornecedores
  );
  resumo.ignorados += itensIgnorados.length;
  resumo.itens.push(...itensIgnorados);

  const total = itensValidos.length;

  if (dryRun) {
    itensValidos.forEach((item, indice) => {
      resumo.itens.push({
        ...item,
        status: 'dry_run',
        motivo: 'Seria processado em execução real.',
      });
      console.log(`\n[${indice + 1}/${total}]`);
      console.log(`✔ ${item.fornecedor_nome} (${item.fornecedor_slug})`);
      console.log(`  Catálogo: ${item.nome}`);
      console.log(`  Arquivo:  ${item.arquivo_pdf}`);
    });

    if (itensIgnorados.length > 0) {
      console.log('\n— Catálogos ignorados —');
      for (const ignorado of itensIgnorados) {
        const rotuloFornecedor = ignorado.fornecedor_nome
          || (ignorado.fornecedor_slug ? ignorado.fornecedor_slug : 'Fornecedor desconhecido');
        console.log(`\n✖ ${rotuloFornecedor}`);
        console.log(`  Catálogo: ${ignorado.nome}`);
        console.log(`  Motivo:   ${ignorado.motivo}`);
      }
    }

    resumo.tempo_total_ms = Date.now() - inicioMs;
    const arquivoSaida = salvarResumoImportacao(resumo);

    console.log('\n🔍 DRY-RUN — nenhum PDF baixado, nenhuma Vision, nenhuma persistência.');
    console.log(`Catálogos encontrados: ${resumo.catalogos_encontrados}`);
    console.log(`Seriam processados: ${total}`);
    console.log(`Ignorados: ${resumo.ignorados}`);
    console.log(`📄 Resumo salvo em: ${arquivoSaida}`);
    return resumo;
  }

  for (let indice = 0; indice < total; indice += 1) {
    let item = itensValidos[indice];
    let relatorio = null;

    console.log(`\n[${indice + 1}/${total}]`);
    console.log(`Fornecedor: ${item.fornecedor_nome} (${item.fornecedor_slug})`);
    console.log(`Catálogo:   ${item.nome}`);
    console.log(`Arquivo:    ${item.arquivo_pdf}`);

    try {
      relatorio = await extrairProdutosCatalogo({
        fornecedorSlug: item.fornecedor_slug,
        nomePdf: item.arquivo_pdf,
        maxPaginas,
        persistir: true,
      });

      const encontrados = relatorio.produtos_encontrados || 0;
      const persistidos = relatorio.persistencia?.persistidos || 0;

      resumo.processados += 1;
      resumo.produtos_encontrados += encontrados;
      resumo.produtos_persistidos += persistidos;

      resumo.itens.push({
        ...item,
        status: 'processado',
        produtos_encontrados: encontrados,
        produtos_persistidos: persistidos,
        metodo_resolucao_catalogo: relatorio.persistencia?.metodo_resolucao_catalogo || null,
        tempo_processamento_ms: relatorio.tempo_processamento_ms,
        tempo_persistencia_ms: relatorio.persistencia?.tempo_ms || 0,
      });
    } catch (error) {
      resumo.erros += 1;
      resumo.itens.push({
        ...item,
        status: 'erro',
        erro: error.message,
      });
      console.error(`❌ Erro no catálogo ${item.catalogo_id}: ${error.message}`);
    } finally {
      // Libera referências grandes para o garbage collector ao processar milhares de PDFs.
      if (relatorio) {
        relatorio.produtos = null;
        relatorio.erros = null;
        relatorio.estatisticas = null;
      }
      relatorio = null;
      itensValidos[indice] = null;
      item = null;
    }
  }

  resumo.tempo_total_ms = Date.now() - inicioMs;
  resumo.tempo_medio_ms = resumo.processados > 0
    ? Math.round(resumo.tempo_total_ms / resumo.processados)
    : 0;

  const arquivoSaida = salvarResumoImportacao(resumo);
  imprimirResumoFinal(resumo);
  console.log(`📄 Resumo salvo em: ${arquivoSaida}`);

  return resumo;
}

async function main() {
  const fornecedorSlug = obterArg('--fornecedor');
  const maxCatalogos = obterArg('--max-catalogos');
  const maxPaginas = Number(obterArg('--max-paginas') || 50);
  const dryRun = obterFlag('--dry-run');

  await importarProdutosCatalogos({
    fornecedorSlug: fornecedorSlug ? fornecedorSlug.toLowerCase() : null,
    maxCatalogos: maxCatalogos ? Number(maxCatalogos) : null,
    maxPaginas,
    dryRun,
  });
}

const ehExecucaoDireta = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ehExecucaoDireta) {
  main().catch((err) => {
    console.error('❌ Falha na importação em lote:', err.message);
    process.exit(1);
  });
}
