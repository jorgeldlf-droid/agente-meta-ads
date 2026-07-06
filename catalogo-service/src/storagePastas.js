export const BUCKET_CATALOGOS = 'catalogos-oficiais';

const PASTAS_STORAGE = {
  catalogos: ['Catálogos', 'catalogos', 'Catalogos', 'catálogos'],
  paginas: ['Páginas', 'paginas', 'Paginas', 'páginas'],
  miniaturas: ['Miniaturas', 'miniaturas'],
  ambientes: ['ambientes', 'Ambientes'],
  produtos: ['produtos', 'Produtos']
};

const cachePastas = new Map();

export function obterCandidatosPasta(tipo) {
  return PASTAS_STORAGE[tipo] || [tipo];
}

export function obterPastaFallback(tipo) {
  const candidatos = obterCandidatosPasta(tipo);
  return candidatos[1] || candidatos[0] || tipo;
}

export async function resolverPastaStorage(supabase, fornecedor, tipo) {
  const candidatos = obterCandidatosPasta(tipo);
  const fallback = obterPastaFallback(tipo);

  if (!supabase || !fornecedor) return fallback;

  const cacheKey = `${fornecedor}:${tipo}`;
  if (cachePastas.has(cacheKey)) return cachePastas.get(cacheKey);

  const { data, error } = await supabase.storage
    .from(BUCKET_CATALOGOS)
    .list(fornecedor, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) {
    console.warn(`Nao foi possivel listar pastas de "${fornecedor}" no Storage: ${error.message}. Usando "${fallback}".`);
    cachePastas.set(cacheKey, fallback);
    return fallback;
  }

  const itemNames = (data || []).map((item) => item.name);

  const nomesExistentes = new Set(itemNames);
  const candidatoEncontrado = candidatos.find((candidato) => nomesExistentes.has(candidato));

  const pastaResolvida = candidatoEncontrado || fallback;
  cachePastas.set(cacheKey, pastaResolvida);
  return pastaResolvida;
}

export async function montarCaminhoStorage(supabase, fornecedor, tipo, nomeArquivo = '') {
  const pasta = await resolverPastaStorage(supabase, fornecedor, tipo);
  return [fornecedor, pasta, nomeArquivo].filter(Boolean).join('/');
}
