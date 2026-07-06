const MAPA_PASTA_PARA_SLUG = {
  'CEUSA': 'ceusa',
  'PORTINARI': 'portinari',
  'ELIANE': 'eliane',
  'DELTA': 'delta',
  'DELTA NOVA': 'delta-nova',
  'ELIZABETH': 'elizabeth',
  'EMBRAMACO': 'embramaco',
  'INCEPA': 'incepa',
  'ROCA CERÂMICA': 'roca',
};

const FORNECEDOR_IGNORADO_V1 = 'GABRIELLA CERÂMICA';

/**
 * Normaliza o nome da pasta local do fornecedor para comparação.
 * @param {string} nome
 * @returns {string}
 */
export function normalizarNomePastaFornecedor(nome = '') {
  return String(nome || '').trim();
}

/**
 * Resolve o slug do Storage a partir do nome da pasta local.
 * @param {string} nomePastaLocal
 * @returns {{ slug: string|null, ignorar: boolean, aviso?: string }}
 */
export function resolverSlugFornecedor(nomePastaLocal = '') {
  const nome = normalizarNomePastaFornecedor(nomePastaLocal);
  const chave = nome.toUpperCase();

  if (chave === FORNECEDOR_IGNORADO_V1) {
    return {
      slug: null,
      ignorar: true,
      aviso: `[Sync Catálogos] Fornecedor "${nome}" ignorado nesta versão (suporte futuro).`,
    };
  }

  const slug = MAPA_PASTA_PARA_SLUG[chave] || null;

  if (!slug) {
    return {
      slug: null,
      ignorar: true,
      aviso: `[Sync Catálogos] Fornecedor desconhecido ignorado: "${nome}".`,
    };
  }

  return { slug, ignorar: false };
}
