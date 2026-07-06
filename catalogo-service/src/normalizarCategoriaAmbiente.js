export const CATEGORIAS_PERMITIDAS = [
  'Cozinha',
  'Banheiro',
  'Sala',
  'Área Gourmet',
  'Fachada',
  'Lavanderia',
  'Quarto',
  'Comercial',
  'Externo',
  'Outros',
];

const CATEGORIA_OUTROS = 'Outros';

const REGRAS_SINONIMOS = [
  { categoria: 'Quarto', termos: ['suite master', 'dormitorio', 'quarto'] },
  { categoria: 'Banheiro', termos: ['banheiro', 'lavabo', 'wc', 'suite'] },
  { categoria: 'Cozinha', termos: ['cozinha decorada', 'cozinha'] },
  { categoria: 'Área Gourmet', termos: ['varanda gourmet', 'area gourmet', 'gourmet', 'churrasqueira'] },
  { categoria: 'Sala', termos: ['living', 'estar', 'sala decorada', 'sala'] },
  { categoria: 'Fachada', termos: ['fachada', 'frente', 'entrada'] },
  { categoria: 'Lavanderia', termos: ['lavanderia', 'area de servico'] },
  { categoria: 'Comercial', termos: ['showroom', 'escritorio', 'comercial', 'loja'] },
  { categoria: 'Externo', termos: ['area externa', 'externo', 'piscina', 'jardim', 'varanda'] },
];

function normalizarTextoComparacao(valor = '') {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function correspondeCategoriaCanonica(valorNormalizado) {
  return CATEGORIAS_PERMITIDAS.find(
    (categoria) => normalizarTextoComparacao(categoria) === valorNormalizado
  ) || null;
}

function inferirCategoriaPorTermos(valorNormalizado) {
  for (const regra of REGRAS_SINONIMOS) {
    for (const termo of regra.termos) {
      if (valorNormalizado.includes(normalizarTextoComparacao(termo))) {
        return regra.categoria;
      }
    }
  }
  return null;
}

/**
 * Normaliza categoria ou infere a partir de descricao livre.
 * Sempre retorna uma das categorias permitidas.
 *
 * @param {string|null|undefined} categoriaOuDescricao
 * @returns {string}
 */
export function normalizarCategoriaAmbiente(categoriaOuDescricao) {
  const texto = String(categoriaOuDescricao || '').trim();
  if (!texto) {
    return CATEGORIA_OUTROS;
  }

  const normalizado = normalizarTextoComparacao(texto);

  const canonica = correspondeCategoriaCanonica(normalizado);
  if (canonica) {
    return canonica;
  }

  const inferida = inferirCategoriaPorTermos(normalizado);
  if (inferida) {
    return inferida;
  }

  return CATEGORIA_OUTROS;
}

/**
 * Monta descricao padronizada sem duplicar prefixo existente.
 *
 * @param {string} categoria
 * @param {string} descricaoOriginal
 * @returns {string}
 */
export function formatarDescricaoAmbiente(categoria, descricaoOriginal = '') {
  const categoriaNormalizada = normalizarCategoriaAmbiente(categoria);
  let descricao = String(descricaoOriginal || '').trim();

  if (!descricao) {
    return `[${categoriaNormalizada}] Ambiente decorado`;
  }

  const prefixoExistente = descricao.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (prefixoExistente) {
    const restante = prefixoExistente[2].trim();
    descricao = restante || descricao;
  }

  return `[${categoriaNormalizada}] ${descricao}`;
}
