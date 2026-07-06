export const REGISTRO_FORNECEDORES = [
  {
    slug: 'portinari',
    nome: 'Portinari',
    site: 'https://www.ceramicaportinari.com.br',
    dominios: ['ceramicaportinari.com.br', 'portinari.com.br'],
  },
  {
    slug: 'ceusa',
    nome: 'Ceusa',
    site: 'https://www.ceusa.com.br',
    dominios: ['ceusa.com.br'],
  },
  {
    slug: 'eliane',
    nome: 'Eliane',
    site: 'https://www.eliane.com',
    dominios: ['eliane.com'],
  },
  {
    slug: 'elizabeth',
    nome: 'Elizabeth',
    site: 'https://www.grupoelizabeth.com.br',
    dominios: ['grupoelizabeth.com.br'],
  },
  {
    slug: 'embramaco',
    nome: 'Embramaco',
    site: 'https://www.embramaco.com.br',
    dominios: ['embramaco.com.br'],
  },
  {
    slug: 'roca',
    nome: 'Roca',
    site: 'https://www.roca.com.br',
    dominios: ['roca.com.br'],
  },
  {
    slug: 'incepa',
    nome: 'Incepa',
    site: 'https://www.incepa.com.br',
    dominios: ['incepa.com.br'],
  },
  {
    slug: 'delta',
    nome: 'Delta',
    site: 'https://www.deltaceramica.com.br',
    dominios: ['deltaceramica.com.br'],
  },
  {
    slug: 'delta-nova',
    nome: 'Delta Nova',
    site: 'https://www.deltaceramica.com.br',
    dominios: ['deltaceramica.com.br'],
  },
];

export function listarNomesFornecedores() {
  return REGISTRO_FORNECEDORES.map((f) => f.nome);
}

export function obterFornecedorPorNome(nome = '') {
  const alvo = String(nome || '').trim().toLowerCase();
  return REGISTRO_FORNECEDORES.find((f) => f.nome.toLowerCase() === alvo) || null;
}

export function obterFornecedorPorSlug(slug = '') {
  const alvo = String(slug || '').trim().toLowerCase();
  return REGISTRO_FORNECEDORES.find((f) => f.slug.toLowerCase() === alvo) || null;
}

export function obterFornecedorPelaUrlImagem(url = '') {
  const lower = String(url || '').toLowerCase();
  const ordenados = [...REGISTRO_FORNECEDORES].sort((a, b) => b.slug.length - a.slug.length);
  return ordenados.find((f) => lower.includes(`/${f.slug}/`)) || null;
}
