import { supabase } from './supabaseClient.js';
import { BUCKET_CATALOGOS } from './storagePastas.js';
import { gerarPastaSaidaSlug } from './gerarPastaSaidaSlug.js';

const PREFIXO_URL_STORAGE = '/storage/v1/object/public/catalogos-oficiais/';
const SEGMENTO_PASTA_CATALOGOS = '/catalogos/';

function extrairCaminhoStorageDaUrl(urlImagem = '') {
  const indice = urlImagem.indexOf(PREFIXO_URL_STORAGE);
  if (indice === -1) return null;
  return decodeURIComponent(urlImagem.slice(indice + PREFIXO_URL_STORAGE.length));
}

function extrairNumerosPaginaDasUrls(imagens = [], pastaSaidaSlug) {
  const regex = new RegExp(`${pastaSaidaSlug}_pagina_(\\d+)\\.png`, 'i');
  const numeros = new Set();

  for (const imagem of imagens) {
    const match = String(imagem.url_imagem || '').match(regex);
    if (match) {
      numeros.add(Number(match[1]));
    }
  }

  return [...numeros];
}

function montarFiltroOrAmbientes(fornecedorSlug, numerosPagina) {
  return numerosPagina
    .map(
      (numero) =>
        `url_imagem.ilike.%/${fornecedorSlug}/ambientes/pagina_pagina_${numero}_ambiente_%`
    )
    .join(',');
}

async function localizarCatalogoExistente(catalogoId) {
  const { data, error } = await supabase
    .from('catalogos')
    .select('id, nome, arquivo_pdf, fornecedor_id')
    .eq('id', catalogoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao localizar catalogo: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Catalogo ID ${catalogoId} nao encontrado.`);
  }

  return data;
}

async function localizarImagensPaginasSeguras(fornecedorSlug, pastaSaidaSlug) {
  const { data, error } = await supabase
    .from('imagens_catalogo')
    .select('id, url_imagem, tipo, pagina')
    .ilike('url_imagem', `%/${fornecedorSlug}/%`)
    .ilike('url_imagem', `%/${pastaSaidaSlug}_pagina_%`);

  if (error) {
    throw new Error(`Falha ao localizar paginas do catalogo: ${error.message}`);
  }

  return data || [];
}

async function localizarImagensAmbientesSeguras(fornecedorSlug, numerosPagina) {
  if (!numerosPagina.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('imagens_catalogo')
    .select('id, url_imagem, tipo, pagina')
    .eq('tipo', 'ambiente')
    .or(montarFiltroOrAmbientes(fornecedorSlug, numerosPagina));

  if (error) {
    throw new Error(`Falha ao localizar ambientes do catalogo: ${error.message}`);
  }

  return data || [];
}

function unificarImagens(...listas) {
  const mapa = new Map();
  for (const lista of listas) {
    for (const imagem of lista) {
      mapa.set(imagem.id, imagem);
    }
  }
  return [...mapa.values()];
}

async function removerArquivosStorage(caminhos = []) {
  const unicos = [...new Set(caminhos.filter(Boolean))];
  if (!unicos.length) return;

  const { error } = await supabase.storage.from(BUCKET_CATALOGOS).remove(unicos);
  if (error) {
    throw new Error(`Falha ao remover arquivos do Storage: ${error.message}`);
  }
}

/**
 * Limpa dados antigos de um catalogo antes de reimportar.
 * Liga apenas imagens com vinculo seguro por URL (sem heuristica por descricao).
 * Se qualquer etapa falhar, lanca erro e a importacao deve abortar.
 */
export async function limparCatalogoExistente({
  catalogoId,
  fornecedorSlug,
  nomeCatalogo,
  pastaSaidaSlug,
}) {
  if (!supabase) {
    throw new Error('Supabase Client nao inicializado.');
  }

  console.log(`[Importador] Catálogo existente encontrado (ID: ${catalogoId}).`);

  console.log('[Importador] Etapa 1/5: Localizando catalogo existente...');
  const catalogo = await localizarCatalogoExistente(catalogoId);
  console.log(
    `[Importador] Catalogo localizado: "${catalogo.nome}" (arquivo_pdf: ${catalogo.arquivo_pdf || 'n/d'})`
  );

  const slugSaida = pastaSaidaSlug || gerarPastaSaidaSlug(nomeCatalogo || catalogo.nome);

  console.log('[Importador] Etapa 2/5: Localizando imagens relacionadas com seguranca...');
  const imagensPaginas = await localizarImagensPaginasSeguras(fornecedorSlug, slugSaida);
  const numerosPagina = extrairNumerosPaginaDasUrls(imagensPaginas, slugSaida);
  const imagensAmbientes = await localizarImagensAmbientesSeguras(fornecedorSlug, numerosPagina);
  const imagensRelacionadas = unificarImagens(imagensPaginas, imagensAmbientes);

  console.log(
    `[Importador] Imagens ligadas com seguranca: ${imagensRelacionadas.length} ` +
    `(paginas/falhas: ${imagensPaginas.length}, ambientes: ${imagensAmbientes.length}, ` +
    `numeros de pagina: [${numerosPagina.join(', ')}])`
  );

  const caminhosStorage = imagensRelacionadas
    .map((imagem) => extrairCaminhoStorageDaUrl(imagem.url_imagem))
    .filter((caminho) => caminho && !caminho.toLowerCase().includes(SEGMENTO_PASTA_CATALOGOS));

  console.log(`[Importador] Etapa 3/5: Removendo ${caminhosStorage.length} PNG(s) do Storage (sem PDFs)...`);
  await removerArquivosStorage(caminhosStorage);

  const imagemIds = imagensRelacionadas.map((imagem) => imagem.id);

  if (imagemIds.length > 0) {
    console.log(`[Importador] Etapa 4/5: Removendo ${imagemIds.length} registro(s) de imagens_catalogo...`);
    const { error: errDeleteImagens } = await supabase
      .from('imagens_catalogo')
      .delete()
      .in('id', imagemIds);

    if (errDeleteImagens) {
      throw new Error(`Falha ao apagar imagens_catalogo: ${errDeleteImagens.message}`);
    }
  } else {
    console.log('[Importador] Etapa 4/5: Nenhum registro em imagens_catalogo para remover.');
  }

  console.log(`[Importador] Etapa 5/5: Removendo registro do catalogo (ID: ${catalogoId})...`);
  const { error: errDeleteCatalogo } = await supabase
    .from('catalogos')
    .delete()
    .eq('id', catalogoId);

  if (errDeleteCatalogo) {
    throw new Error(`Falha ao apagar catalogos: ${errDeleteCatalogo.message}`);
  }

  console.log('[Importador] Limpeza concluida.');
}
