import { normalizarCategoriaAmbiente } from '../normalizarCategoriaAmbiente.js';
import { normalizarEstilo } from '../normalizarMetadadosAmbiente.js';

export const VERSAO_EXTRATOR_PRODUTO = '1.0.0';

export const ACABAMENTOS_PERMITIDOS = [
  'Polido',
  'Acetinado',
  'Natural',
  'Mate',
  'Lappato',
  'Brilhante',
  'Rústico',
  'Outros',
];

export const VISUAIS_PERMITIDOS = [
  'Mármore',
  'Madeira',
  'Cimento',
  'Pedra',
  'Metal',
  'Monocromático',
  'Terrazzo',
  'Outros',
];

export const CORES_PERMITIDAS = [
  'Branco',
  'Bege',
  'Cinza claro',
  'Cinza escuro',
  'Preto',
  'Marrom',
  'Madeira',
  'Colorido',
  'Outros',
];

export const USOS_PERMITIDOS = [
  'Interno',
  'Externo',
  'Interno e externo',
  'Parede',
  'Piso',
  'Piso e parede',
  'Outros',
];

export const CATEGORIAS_PERMITIDAS = [
  'Premium',
  'Standard',
  'Econômico',
  'Outros',
];

export const RETIFICADOS_PERMITIDOS = [
  'Sim',
  'Não',
  'Outros',
];

export const VARIACOES_TONALIDADE_PERMITIDAS = ['V1', 'V2', 'V3', 'V4'];

export const CONFIANCAS_EXTRACAO_PERMITIDAS = ['alta', 'media', 'baixa'];

const METADADO_OUTROS = 'Outros';

const REGRAS_ACABAMENTO = [
  { valor: 'Polido', termos: ['polido', 'pol', 'polished'] },
  { valor: 'Acetinado', termos: ['acetinado', 'act', 'satin', 'satinado'] },
  { valor: 'Natural', termos: ['natural', 'nat'] },
  { valor: 'Mate', termos: ['mate', 'fosco', 'matte'] },
  { valor: 'Lappato', termos: ['lappato', 'lapato'] },
  { valor: 'Brilhante', termos: ['brilhante', 'gloss', 'glazed'] },
  { valor: 'Rústico', termos: ['rustico', 'rustic'] },
];

const REGRAS_VISUAL = [
  { valor: 'Mármore', termos: ['marmore', 'marble', 'marmorizado'] },
  { valor: 'Madeira', termos: ['madeira', 'wood', 'amadeirado'] },
  { valor: 'Cimento', termos: ['cimento', 'concreto', 'concrete', 'urban'] },
  { valor: 'Pedra', termos: ['pedra', 'stone', 'ardesia', 'slate'] },
  { valor: 'Metal', termos: ['metal', 'metallic', 'metalico'] },
  { valor: 'Monocromático', termos: ['monocromatico', 'unicolor', 'uniforme'] },
  { valor: 'Terrazzo', termos: ['terrazzo', 'granilite'] },
];

const REGRAS_COR = [
  { valor: 'Cinza escuro', termos: ['cinza escuro', 'grafite', 'antracite'] },
  { valor: 'Cinza claro', termos: ['cinza claro', 'cinza', 'grey', 'gray'] },
  { valor: 'Branco', termos: ['branco', 'white', 'off white'] },
  { valor: 'Bege', termos: ['bege', 'areia', 'nude', 'creme'] },
  { valor: 'Preto', termos: ['preto', 'black'] },
  { valor: 'Marrom', termos: ['marrom', 'brown', 'terroso'] },
  { valor: 'Madeira', termos: ['madeira', 'wood'] },
  { valor: 'Colorido', termos: ['colorido', 'multicolor', 'vibrante'] },
];

const REGRAS_USO = [
  { valor: 'Externo', termos: ['externo', 'outdoor', 'area externa', 'antiderrapante', 'hard'] },
  { valor: 'Interno', termos: ['interno', 'indoor', 'residencial'] },
  { valor: 'Interno e externo', termos: ['interno e externo', 'indoor outdoor'] },
  { valor: 'Parede', termos: ['parede', 'wall', 'revestimento de parede'] },
  { valor: 'Piso', termos: ['piso', 'floor', 'pavimento'] },
  { valor: 'Piso e parede', termos: ['piso e parede', 'floor and wall'] },
];

const REGRAS_CATEGORIA = [
  { valor: 'Premium', termos: ['premium', 'luxo', 'alto padrao', 'exclusive'] },
  { valor: 'Standard', termos: ['standard', 'padrao', 'classico comercial'] },
  { valor: 'Econômico', termos: ['economico', 'entry', 'custo beneficio'] },
];

const REGRAS_RETIFICADO = [
  { valor: 'Sim', termos: ['sim', 'yes', 'retificado', 'rectified', 'ret'] },
  { valor: 'Não', termos: ['nao', 'não', 'no', 'nao retificado', 'não retificado', 'non rectified'] },
];

function normalizarTextoComparacao(valor = '') {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function correspondeValorCanonico(valorNormalizado, permitidos) {
  return permitidos.find(
    (item) => normalizarTextoComparacao(item) === valorNormalizado
  ) || null;
}

function inferirPorTermos(valorNormalizado, regras) {
  for (const regra of regras) {
    for (const termo of regra.termos) {
      if (valorNormalizado.includes(normalizarTextoComparacao(termo))) {
        return regra.valor;
      }
    }
  }
  return null;
}

function normalizarMetadadoEnum(valor, permitidos, regrasSinonimos) {
  const texto = String(valor || '').trim();
  if (!texto) return METADADO_OUTROS;

  const normalizado = normalizarTextoComparacao(texto);
  const canonico = correspondeValorCanonico(normalizado, permitidos);
  if (canonico) return canonico;

  const inferido = inferirPorTermos(normalizado, regrasSinonimos);
  if (inferido) return inferido;

  return METADADO_OUTROS;
}

export function normalizarAcabamento(valor) {
  return normalizarMetadadoEnum(valor, ACABAMENTOS_PERMITIDOS, REGRAS_ACABAMENTO);
}

export function normalizarVisual(valor) {
  return normalizarMetadadoEnum(valor, VISUAIS_PERMITIDOS, REGRAS_VISUAL);
}

export function normalizarCor(valor) {
  return normalizarMetadadoEnum(valor, CORES_PERMITIDAS, REGRAS_COR);
}

export function normalizarUso(valor) {
  return normalizarMetadadoEnum(valor, USOS_PERMITIDOS, REGRAS_USO);
}

export function normalizarCategoria(valor) {
  return normalizarMetadadoEnum(valor, CATEGORIAS_PERMITIDAS, REGRAS_CATEGORIA);
}

export function normalizarRetificado(valor) {
  return normalizarMetadadoEnum(valor, RETIFICADOS_PERMITIDOS, REGRAS_RETIFICADO);
}

export function normalizarVariacaoTonalidade(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const normalizado = normalizarTextoComparacao(texto);

  const direto = normalizado.match(/^v([1-4])$/);
  if (direto) return `V${direto[1]}`;

  const contextual = normalizado.match(
    /(?:tonalidade|variacao(?:\s+de\s+tonalidade)?|shade\s+variation)\s+v([1-4])/
  );
  if (contextual) return `V${contextual[1]}`;

  const embutido = normalizado.match(/\bv([1-4])\b/);
  if (embutido) return `V${embutido[1]}`;

  return null;
}

export function normalizarConfiancaExtracao(valor) {
  const normalizado = normalizarTextoComparacao(valor);
  if (CONFIANCAS_EXTRACAO_PERMITIDAS.includes(normalizado)) {
    return normalizado;
  }
  return 'baixa';
}

export function normalizarLinhaProduto(valor) {
  const texto = String(valor || '').trim();
  return texto || null;
}

export function normalizarFormato(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const match = texto.match(/(\d{2,3})\s*[xX×]\s*(\d{2,3})/);
  if (match) {
    return `${match[1]}x${match[2]}`;
  }

  return texto.replace(/\s+/g, ' ').trim();
}

export function normalizarEspessura(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const match = texto.match(/(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (match) {
    const numero = match[1].replace(',', '.');
    return `${numero}mm`;
  }

  const apenasNumero = texto.match(/^(\d+(?:[.,]\d+)?)$/);
  if (apenasNumero) {
    return `${apenasNumero[1].replace(',', '.')}mm`;
  }

  return texto.replace(/\s+/g, ' ').trim();
}

export function normalizarListaAmbientes(valores = []) {
  const lista = Array.isArray(valores) ? valores : [valores];
  const unicos = new Map();

  for (const item of lista) {
    const texto = String(item || '').trim();
    if (!texto) continue;
    const normalizado = normalizarCategoriaAmbiente(texto);
    unicos.set(normalizarTextoComparacao(normalizado), normalizado);
  }

  return [...unicos.values()];
}

export function normalizarPalavrasChave(valores = []) {
  const lista = Array.isArray(valores)
    ? valores
    : String(valores || '').split(/[,;|]/);

  const unicos = new Map();

  for (const item of lista) {
    const texto = String(item || '').trim().toLowerCase();
    if (!texto || texto.length < 2) continue;
    const chave = normalizarTextoComparacao(texto);
    unicos.set(chave, texto);
  }

  return [...unicos.values()];
}

export function gerarSlugProduto({
  linhaProduto = '',
  colecao = '',
  nomeProduto = '',
  formato = '',
  paginaOrigem = null,
} = {}) {
  const partes = [
    linhaProduto,
    colecao,
    nomeProduto,
    formato,
    paginaOrigem ? `p${paginaOrigem}` : '',
  ]
    .map((parte) => String(parte || '').trim())
    .filter(Boolean);

  const base = partes.join(' ') || 'produto-sem-identificacao';

  const slug = normalizarTextoComparacao(base)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  return slug || 'produto-sem-identificacao';
}

/**
 * Monta objeto padronizado pronto para futura persistência em produtos_catalogo.
 * Não chama IA. Não grava no banco.
 */
export function montarProdutoComercialPadronizado(entrada = {}) {
  const linhaProduto = normalizarLinhaProduto(
    entrada.linha_produto || entrada.linhaProduto
  );
  const colecao = String(entrada.colecao || '').trim() || null;
  const nomeProduto = String(entrada.nome_produto || entrada.nomeProduto || '').trim() || null;
  const formato = normalizarFormato(entrada.formato);
  const espessura = normalizarEspessura(entrada.espessura);
  const acabamento = normalizarAcabamento(entrada.acabamento);
  const retificado = normalizarRetificado(entrada.retificado);
  const variacaoTonalidade = normalizarVariacaoTonalidade(
    entrada.variacao_tonalidade || entrada.variacaoTonalidade
  );
  const visual = normalizarVisual(entrada.visual);
  const cor = normalizarCor(entrada.cor);
  const estilo = normalizarEstilo(entrada.estilo);
  const uso = normalizarUso(entrada.uso);
  const categoria = normalizarCategoria(entrada.categoria);

  const ambientesIndicados = normalizarListaAmbientes(entrada.ambientes_indicados);
  const ambientesNaoIndicados = normalizarListaAmbientes(entrada.ambientes_nao_indicados);
  const palavrasChave = normalizarPalavrasChave(entrada.palavras_chave);

  const paginaOrigem = Number.isInteger(entrada.pagina_origem)
    ? entrada.pagina_origem
    : (Number(entrada.pagina_origem) > 0 ? Number(entrada.pagina_origem) : null);

  const slugProduto = gerarSlugProduto({
    linhaProduto,
    colecao,
    nomeProduto,
    formato,
    paginaOrigem,
  });

  return {
    catalogo_id: entrada.catalogo_id || null,
    fornecedor_id: entrada.fornecedor_id || null,
    pagina_origem: paginaOrigem,
    linha_produto: linhaProduto,
    colecao,
    nome_produto: nomeProduto,
    slug_produto: slugProduto,
    formato,
    espessura,
    acabamento,
    retificado,
    variacao_tonalidade: variacaoTonalidade,
    visual,
    cor,
    estilo,
    uso,
    categoria,
    ambientes_indicados: ambientesIndicados,
    ambientes_nao_indicados: ambientesNaoIndicados,
    palavras_chave: palavrasChave,
    resumo_ia: null,
    confianca_extracao: normalizarConfiancaExtracao(entrada.confianca_extracao),
    versao_extrator: String(entrada.versao_extrator || VERSAO_EXTRATOR_PRODUTO).trim(),
    metadados_brutos:
      entrada.metadados_brutos && typeof entrada.metadados_brutos === 'object'
        ? entrada.metadados_brutos
        : {},
    url_imagem_referencia: String(entrada.url_imagem_referencia || '').trim() || null,
  };
}
