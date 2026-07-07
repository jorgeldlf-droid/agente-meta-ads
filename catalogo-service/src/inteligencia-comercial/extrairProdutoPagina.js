import {
  montarProdutoComercialPadronizado,
  VERSAO_EXTRATOR_PRODUTO,
} from './normalizarProdutoComercial.js';
import { validarProdutoComercial } from './validarProdutoComercial.js';
import { extrairAtributosVisuaisVision } from './extrairAtributosVisuaisVision.js';

export const CAMPOS_COMPLETUDE = [
  'linha_produto',
  'colecao',
  'nome_produto',
  'formato',
  'espessura',
  'acabamento',
  'retificado',
  'variacao_tonalidade',
  'visual',
  'cor',
  'estilo',
  'uso',
  'categoria',
  'ambientes_indicados',
  'ambientes_nao_indicados',
  'palavras_chave',
];

const CAMPOS_ENUM = new Set([
  'acabamento', 'retificado', 'visual', 'cor', 'estilo', 'uso', 'categoria',
]);

function registrarOrigem(origens, campo, origem) {
  if (!origens[campo]) origens[campo] = origem;
}

const TERMOS_EDITORIAIS = /\b(apresenta|possui|pode|deve|proporciona|inspirado|ambiente|proxima|próxima|predominante|nuance|design que|proporcionando|caracteriza|ideal para|perfeito para)\b/i;

const TERMOS_TECNICOS_TABELA = /\b(formato|dimens|dimensão|dimensao|\d+\s*cm\b|pei|abs|cof|variacao|variação|retificado|polido|acetinado|mate\b|natural\b|\d{2,3}\s*[x×]\s*\d{2,3}|\d+\s*mm\b)\b/i;

const TERMOS_LOGISTICOS = /\b(pallet|pallets|por\s+pallet|caixa|caixas|m²|m2|m³|m3|peças|pecas|peso|kg|empilhamento|camada|camadas|quantidade|qtd|embalagem|codigo|código|sku|ean)\b/i;

const TERMOS_AVISO_TECNICO = [
  'atencao',
  'obs',
  'observacao',
  'aviso',
  'importante',
  'nota',
  'informacao',
];

const TERMOS_ROTULO_FICHA_TECNICA = [
  'indicacao de uso',
  'de uso',
  'uso',
  'local de uso',
  'ambiente de uso',
  'aplicacao',
  'recomendacao',
  'caracteristicas',
  'especificacoes',
  'ficha tecnica',
];

function normalizarLinhaComparacao(linha = '') {
  return String(linha || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.:,\-]+$/g, '')
    .trim()
    .toLowerCase();
}

function ehAvisoTecnico(linha = '') {
  const texto = String(linha || '').trim();
  if (!texto) return false;

  const normalizado = normalizarLinhaComparacao(texto);

  if (TERMOS_AVISO_TECNICO.includes(normalizado)) return true;

  if (texto.length <= 40) {
    return TERMOS_AVISO_TECNICO.some(
      (termo) => normalizado === termo || normalizado.startsWith(`${termo} `) || normalizado.startsWith(`${termo}:`)
    );
  }

  return false;
}

function ehRotuloFichaTecnica(linha = '') {
  const texto = String(linha || '').trim();
  if (!texto) return false;

  const normalizado = normalizarLinhaComparacao(texto);

  if (TERMOS_ROTULO_FICHA_TECNICA.includes(normalizado)) return true;

  if (texto.length <= 45) {
    return TERMOS_ROTULO_FICHA_TECNICA.some(
      (termo) => normalizado === termo || normalizado.startsWith(`${termo} `) || normalizado.startsWith(`${termo}:`)
    );
  }

  return false;
}

function ehFragmentoTabelaInvalido(linha = '') {
  const texto = String(linha || '').trim();
  if (!texto || texto.length > 12) return false;

  if (/^[-–—\s]+[a-záéíóúãõç]{1,2}$/i.test(texto)) return true;
  if (/^[a-z]{1,3}\s*[-–—]\s*[a-záéíóúãõç]{1,2}$/i.test(texto)) return true;
  if (/^tp\s*[-–—]/i.test(texto)) return true;

  return false;
}

function ehIdentidadeVariacaoTonalidade(linha = '') {
  const texto = String(linha || '').trim();
  if (!texto) return false;

  const semPontuacaoFinal = texto.replace(/[-–—\s]+$/g, '').trim();
  const normalizado = semPontuacaoFinal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/^v[1-4]$/.test(normalizado)) return true;
  if (/^(tonalidade|variacao(?:\s+de\s+tonalidade)?|shade\s+variation)\s+v[1-4]$/.test(normalizado)) {
    return true;
  }
  if (/^(tonalidade|variacao)\s+v[1-4]/.test(normalizado) && semPontuacaoFinal.length <= 30) {
    return true;
  }

  return false;
}

function linhaInvalidaParaIdentidade(linha = '') {
  const texto = String(linha || '').trim();
  if (!texto || texto.length < 2 || texto.length > 50) return true;
  if (ehIdentidadeVariacaoTonalidade(texto)) return true;
  if (ehAvisoTecnico(texto)) return true;
  if (ehRotuloFichaTecnica(texto)) return true;
  if (ehFragmentoTabelaInvalido(texto)) return true;
  if (TERMOS_EDITORIAIS.test(texto)) return true;
  if (TERMOS_TECNICOS_TABELA.test(texto)) return true;
  if (TERMOS_LOGISTICOS.test(texto)) return true;
  if (/^(por\s+)?pallet\s*\d+/i.test(texto)) return true;
  if (/^caixa\s*[\d,.]+\s*m/i.test(texto)) return true;
  if (/[.!?]{2,}/.test(texto)) return true;
  if (/["«»""]/.test(texto) && texto.length > 20) return true;
  if (/\b(de|da|do|das|dos|que|com|para|uma|um|the|and|with|peças|peça)\b/i.test(texto) && texto.split(/\s+/).length > 4) {
    return true;
  }
  return false;
}

function pontuarCandidatoNome(linha = '') {
  const texto = String(linha || '').trim();
  if (linhaInvalidaParaIdentidade(texto)) return -1;

  let score = 0;

  if (/^[A-Z][A-Z0-9]+-\d{1,3}$/.test(texto.replace(/\s/g, ''))) {
    score += 100;
  }

  const ehCaixaAlta = texto === texto.toUpperCase() && /[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ]/.test(texto);
  if (ehCaixaAlta && texto.length <= 35) {
    score += 70;
    if (texto.split(/\s+/).length <= 3) score += 20;
  }

  if (/^[A-Za-z][A-Za-z0-9\-]{2,25}$/.test(texto) && !/\s/.test(texto)) {
    score += 45;
  }

  if (texto.length > 35) score -= 40;
  if (texto.split(/\s+/).length > 5) score -= 30;

  return score;
}

function extrairNomeProdutoDoTexto(texto = '') {
  const candidatos = new Set();

  const segmentos = String(texto || '')
    .split(/[\n\r]|(?:\.\s+)|(?:;\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segmentos) candidatos.add(seg);

  const codigos = String(texto).match(/\b([A-Z][A-Z0-9]+-\d{1,3})\b/g) || [];
  for (const cod of codigos) candidatos.add(cod);

  const caixaAlta = String(texto).match(/\b[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ0-9\s\-]{2,30}\b/g) || [];
  for (const item of caixaAlta) candidatos.add(item.trim());

  let melhor = null;
  let melhorScore = 0;

  for (const cand of candidatos) {
    const score = pontuarCandidatoNome(cand);
    if (score > melhorScore) {
      melhorScore = score;
      melhor = cand.trim();
    }
  }

  return melhorScore >= 40 ? melhor : null;
}

function extrairVariacaoTonalidadeDoTexto(texto = '', origens = {}) {
  const t = String(texto || '');

  const padroes = [
    /\b(?:tonalidade|varia[cç][aã]o(?:\s+de\s+tonalidade)?|shade\s+variation)\s+v\s*([1-4])\b/i,
    /\bvariacao\s+tonalidade\s+v\s*([1-4])\b/i,
    /\bV([1-4])\b/,
  ];

  for (const padrao of padroes) {
    const match = t.match(padrao);
    if (match) {
      const valor = `V${match[1]}`;
      registrarOrigem(origens, 'variacao_tonalidade', 'pdf_texto');
      return valor;
    }
  }

  return null;
}

function extrairColecaoLinha(texto = '', origens = {}, resultado = {}) {
  const colecaoMatch = texto.match(
    /\b(colecao|coleção|collection|linha)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 \-]{1,30})/i
  );

  if (colecaoMatch) {
    const valor = colecaoMatch[2].trim().split(/\s{2,}|\.|,|;$/)[0].trim();
    if (!linhaInvalidaParaIdentidade(valor)) {
      resultado.colecao = valor;
      resultado.linha_produto = valor;
      registrarOrigem(origens, 'colecao', 'pdf_texto');
      registrarOrigem(origens, 'linha_produto', 'pdf_texto');
      return;
    }
  }

  const nome = resultado.nome_produto;
  if (!nome || !/^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ0-9\s\-]+$/.test(nome)) return;

  const partes = nome.split(/\s+/).filter(Boolean);
  if (partes.length < 2 || partes.length > 4) return;

  const colecao = partes.length === 2 ? partes[1] : partes.slice(1).join(' ');
  if (linhaInvalidaParaIdentidade(colecao)) return;

  if (!resultado.colecao) {
    resultado.colecao = colecao;
    registrarOrigem(origens, 'colecao', 'pdf_texto');
  }
  if (!resultado.linha_produto) {
    resultado.linha_produto = colecao;
    registrarOrigem(origens, 'linha_produto', 'pdf_texto');
  }
}

function campoPreenchido(produto, campo) {
  const valor = produto[campo];
  if (Array.isArray(valor)) return valor.length > 0;
  if (valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  if (!texto) return false;
  if (CAMPOS_ENUM.has(campo)) return texto !== 'Outros';
  return true;
}

/**
 * Calcula completude sobre produto normalizado.
 */
export function calcularCompletude(produto = {}) {
  const camposExtraidos = CAMPOS_COMPLETUDE.filter((c) => campoPreenchido(produto, c)).length;
  const camposVazios = CAMPOS_COMPLETUDE.length - camposExtraidos;
  const percentualCompletude = Math.round((camposExtraidos / CAMPOS_COMPLETUDE.length) * 100);

  return {
    campos_extraidos: camposExtraidos,
    campos_vazios: camposVazios,
    percentual_completude: percentualCompletude,
  };
}

/**
 * Confiança por campo com base nas origens da extração.
 */
export function montarConfiancaCampos(produto = {}, origens = {}) {
  const confiancaCampos = {};

  for (const campo of CAMPOS_COMPLETUDE) {
    const origem = origens[campo];
    if (origem === 'pdf_texto') {
      confiancaCampos[campo] = 'alta';
    } else if (origem === 'vision') {
      confiancaCampos[campo] = 'media';
    } else if (campoPreenchido(produto, campo)) {
      confiancaCampos[campo] = 'media';
    } else {
      confiancaCampos[campo] = 'baixa';
    }
  }

  return confiancaCampos;
}

function extrairCamposDoTexto(texto = '', origens = {}) {
  const resultado = {};
  const t = String(texto || '');

  const formatoMatch = t.match(/(\d{2,3})\s*[xX×]\s*(\d{2,3})/);
  if (formatoMatch) {
    resultado.formato = `${formatoMatch[1]}x${formatoMatch[2]}`;
    registrarOrigem(origens, 'formato', 'pdf_texto');
  }

  const espessuraMatch = t.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (espessuraMatch) {
    resultado.espessura = `${espessuraMatch[1].replace(',', '.')} mm`;
    registrarOrigem(origens, 'espessura', 'pdf_texto');
  }

  const acabamentoMatch = t.match(/\b(polido|pol|acetinado|act|natural|nat|mate|lappato|brilhante|rustico|rústico)\b/i);
  if (acabamentoMatch) {
    resultado.acabamento = acabamentoMatch[1];
    registrarOrigem(origens, 'acabamento', 'pdf_texto');
  }

  if (/\bretificado\b/i.test(t)) {
    resultado.retificado = 'Sim';
    registrarOrigem(origens, 'retificado', 'pdf_texto');
  } else if (/\b(nao|não)\s+retificado\b/i.test(t)) {
    resultado.retificado = 'Não';
    registrarOrigem(origens, 'retificado', 'pdf_texto');
  }

  const variacaoTonalidade = extrairVariacaoTonalidadeDoTexto(t, origens);
  if (variacaoTonalidade) {
    resultado.variacao_tonalidade = variacaoTonalidade;
  }

  const nomeProduto = extrairNomeProdutoDoTexto(t);
  if (nomeProduto) {
    resultado.nome_produto = nomeProduto;
    registrarOrigem(origens, 'nome_produto', 'pdf_texto');
  }

  extrairColecaoLinha(t, origens, resultado);

  return resultado;
}

/**
 * Extrai produto de UMA página comercial. Não persiste.
 */
export async function extrairProdutoPagina({
  pagina,
  caminhoImagem,
  texto = '',
  textoSuficiente = false,
  avisoOcr = null,
}) {
  const origens = {};
  const camposTexto = extrairCamposDoTexto(texto, origens);

  if (textoSuficiente) {
    origens._texto = 'pdf_texto';
  } else {
    origens._texto = 'pdf_texto_insuficiente';
    if (avisoOcr) origens._aviso_ocr = 'ocr_indisponivel';
  }

  const vision = await extrairAtributosVisuaisVision({
    caminhoImagem,
    camposTexto,
  });

  Object.assign(origens, vision.origens);

  const produtoExtraido = {
    pagina_origem: pagina,
    versao_extrator: VERSAO_EXTRATOR_PRODUTO,
    ...camposTexto,
    ...vision.complemento,
    confianca_extracao: textoSuficiente ? 'media' : 'baixa',
    metadados_brutos: {
      origens,
      confianca_campos: {},
      texto_caracteres: texto.length,
      texto_suficiente: textoSuficiente,
      aviso_ocr: avisoOcr,
      vision_fonte: vision.fonte,
      vision_motivo: vision.motivo,
    },
  };

  const produtoNormalizado = montarProdutoComercialPadronizado(produtoExtraido);
  const validacao = validarProdutoComercial(produtoNormalizado);

  produtoExtraido.metadados_brutos.confianca_campos = montarConfiancaCampos(
    produtoNormalizado,
    origens
  );

  const completude = calcularCompletude(produtoNormalizado);

  return {
    pagina,
    produto_extraido: produtoExtraido,
    produto_normalizado: validacao.produto,
    validacao: {
      valido: validacao.valido,
      erros: validacao.erros,
    },
    completude,
    vision_fonte: vision.fonte,
  };
}
