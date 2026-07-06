import { normalizarCategoriaAmbiente } from './normalizarCategoriaAmbiente.js';

export const ESTILOS_PERMITIDOS = [
  'Moderno',
  'Contemporâneo',
  'Clássico',
  'Rústico',
  'Industrial',
  'Minimalista',
  'Sofisticado',
  'Natural',
  'Outros',
];

export const TONALIDADES_PERMITIDAS = [
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

export const SENSACOES_PERMITIDAS = [
  'Aconchegante',
  'Clean',
  'Luxuoso',
  'Minimalista',
  'Natural',
  'Urbano',
  'Elegante',
  'Funcional',
  'Outros',
];

const METADADO_OUTROS = 'Outros';

const REGRAS_ESTILO = [
  { valor: 'Moderno', termos: ['moderno', 'modern'] },
  { valor: 'Contemporâneo', termos: ['contemporaneo', 'contemporary'] },
  { valor: 'Clássico', termos: ['classico', 'classic', 'tradicional', 'neoclassico'] },
  { valor: 'Rústico', termos: ['rustico', 'country', 'campo', 'farmhouse'] },
  { valor: 'Industrial', termos: ['industrial', 'loft'] },
  { valor: 'Minimalista', termos: ['minimalista', 'minimal'] },
  { valor: 'Sofisticado', termos: ['sofisticado', 'chic', 'refinado', 'premium'] },
  { valor: 'Natural', termos: ['natural', 'organico', 'biophilic'] },
];

const REGRAS_TONALIDADE = [
  { valor: 'Cinza escuro', termos: ['cinza escuro', 'grafite', 'antracite', 'grey dark', 'gray dark'] },
  { valor: 'Cinza claro', termos: ['cinza claro', 'cinza', 'grey light', 'gray light', 'prata claro'] },
  { valor: 'Branco', termos: ['branco', 'white', 'off white', 'gelo'] },
  { valor: 'Bege', termos: ['bege', 'areia', 'nude', 'creme'] },
  { valor: 'Preto', termos: ['preto', 'black'] },
  { valor: 'Marrom', termos: ['marrom', 'brown', 'terroso', 'chocolate'] },
  { valor: 'Madeira', termos: ['madeira', 'wood', 'madeirado', 'tons madeira'] },
  { valor: 'Colorido', termos: ['colorido', 'vibrante', 'multicolor', 'colorful'] },
];

const REGRAS_SENSACAO = [
  { valor: 'Aconchegante', termos: ['aconchegante', 'cozy', 'acolhedor', 'warm'] },
  { valor: 'Clean', termos: ['clean', 'limpo', 'fresco', 'fresh'] },
  { valor: 'Luxuoso', termos: ['luxuoso', 'luxury', 'opulento'] },
  { valor: 'Minimalista', termos: ['minimalista', 'essencial', 'descomplicado'] },
  { valor: 'Natural', termos: ['natural', 'earthy', 'organico'] },
  { valor: 'Urbano', termos: ['urbano', 'urban', 'metropolitano', 'city'] },
  { valor: 'Elegante', termos: ['elegante', 'elegant', 'chique'] },
  { valor: 'Funcional', termos: ['funcional', 'pratico', 'utilitario', 'practical'] },
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
  if (!texto) {
    return METADADO_OUTROS;
  }

  const normalizado = normalizarTextoComparacao(texto);
  const canonico = correspondeValorCanonico(normalizado, permitidos);
  if (canonico) {
    return canonico;
  }

  const inferido = inferirPorTermos(normalizado, regrasSinonimos);
  if (inferido) {
    return inferido;
  }

  return METADADO_OUTROS;
}

export function normalizarEstilo(valor) {
  return normalizarMetadadoEnum(valor, ESTILOS_PERMITIDOS, REGRAS_ESTILO);
}

export function normalizarTonalidade(valor) {
  return normalizarMetadadoEnum(valor, TONALIDADES_PERMITIDAS, REGRAS_TONALIDADE);
}

export function normalizarSensacao(valor) {
  return normalizarMetadadoEnum(valor, SENSACOES_PERMITIDAS, REGRAS_SENSACAO);
}

/**
 * Normaliza metadados visuais retornados pela Vision.
 * Campos ausentes ou inválidos viram "Outros".
 * Não altera persistência — apenas prepara dados em memória.
 */
export function normalizarMetadadosAmbiente(metadados = {}) {
  const descricaoFallback = metadados.descricaoOriginal || metadados.descricao || '';

  return {
    categoria: normalizarCategoriaAmbiente(metadados.categoria || descricaoFallback),
    estilo: normalizarEstilo(metadados.estilo),
    tonalidade: normalizarTonalidade(metadados.tonalidade),
    sensacao: normalizarSensacao(metadados.sensacao),
  };
}
