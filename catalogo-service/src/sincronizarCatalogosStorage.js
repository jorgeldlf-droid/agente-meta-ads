import fs from 'fs';
import path from 'path';
import { supabase } from './supabaseClient.js';
import { BUCKET_CATALOGOS, montarCaminhoStorage } from './storagePastas.js';
import { resolverBibliotecaCatalogos } from './resolverBibliotecaCatalogos.js';
import { resolverSlugFornecedor } from './mapeamentoFornecedores.js';
import {
  sanitizarNomeArquivoStorage,
  nomeArquivoPrecisaSanitizacao,
} from './sanitizarChaveStorage.js';

const SUBPASTA_PDFS = 'PDFs';
const LIMITE_MB = 150;
const MAX_SIZE_BYTES = LIMITE_MB * 1024 * 1024;
const LIMITE_LISTAGEM_STORAGE = 1000;

let sincronizacaoEmAndamento = false;

function obterTamanhoArquivo(caminhoLocal) {
  return fs.statSync(caminhoLocal).size;
}

function listarPdfsLocais(pastaPdfs) {
  if (!fs.existsSync(pastaPdfs)) return [];

  return fs
    .readdirSync(pastaPdfs)
    .filter((nome) => nome.toLowerCase().endsWith('.pdf'))
    .map((nome) => path.join(pastaPdfs, nome));
}

// TODO: Adicionar paginação caso algum fornecedor ultrapasse 1000 PDFs.
async function listarPdfsRemotos(fornecedorSlug) {
  if (!supabase) return new Map();

  const folder = await montarCaminhoStorage(supabase, fornecedorSlug, 'catalogos');
  const { data, error } = await supabase.storage
    .from(BUCKET_CATALOGOS)
    .list(folder, {
      limit: LIMITE_LISTAGEM_STORAGE,
      sortBy: { column: 'name', order: 'asc' },
    });

  if (error) {
    throw new Error(`Erro ao listar PDFs remotos de "${fornecedorSlug}": ${error.message}`);
  }

  const indice = new Map();

  for (const arquivo of data || []) {
    if (!arquivo.name.toLowerCase().endsWith('.pdf')) continue;
    const sizeBytes = arquivo.metadata?.size ?? 0;
    indice.set(arquivo.name, sizeBytes);
  }

  return indice;
}

async function enviarPdfParaStorage(caminhoLocal, fornecedorSlug, nomeArquivo, usarUpsert) {
  const remotePath = await montarCaminhoStorage(supabase, fornecedorSlug, 'catalogos', nomeArquivo);
  const fileBuffer = fs.readFileSync(caminhoLocal);

  const { error } = await supabase.storage
    .from(BUCKET_CATALOGOS)
    .upload(remotePath, fileBuffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: usarUpsert,
    });

  if (error) {
    throw new Error(`Falha no upload de "${nomeArquivo}": ${error.message}`);
  }
}

// TODO: No futuro integrar automaticamente o Importador Universal
// executando apenas para PDFs novos ou alterados enviados ao Storage.
async function sincronizarFornecedor(bibliotecaRaiz, nomePastaFornecedor, resumo) {
  const resultado = resolverSlugFornecedor(nomePastaFornecedor);

  if (resultado.ignorar) {
    if (resultado.aviso) {
      console.warn(resultado.aviso);
    }
    return;
  }

  const fornecedorSlug = resultado.slug;
  const pastaPdfs = path.join(bibliotecaRaiz, nomePastaFornecedor, SUBPASTA_PDFS);
  const pdfsLocais = listarPdfsLocais(pastaPdfs);

  if (pdfsLocais.length === 0) {
    console.log(`[Sync Catálogos] ${nomePastaFornecedor} (${fornecedorSlug}): nenhum PDF encontrado.`);
    return;
  }

  console.log(`[Sync Catálogos] Fornecedor: ${nomePastaFornecedor} (${fornecedorSlug}) — ${pdfsLocais.length} PDF(s) local(is).`);

  let indiceRemoto;
  try {
    indiceRemoto = await listarPdfsRemotos(fornecedorSlug);
  } catch (error) {
    resumo.erros += 1;
    console.error(`[Sync Catálogos] Erro ao listar remoto de ${fornecedorSlug}:`, error.message);
    return;
  }

  for (const caminhoLocal of pdfsLocais) {
    const nomeArquivoLocal = path.basename(caminhoLocal);
    const nomeArquivo = sanitizarNomeArquivoStorage(nomeArquivoLocal);

    if (nomeArquivoPrecisaSanitizacao(nomeArquivoLocal)) {
      console.log(
        `[Sync Catálogos] Nome sanitizado para Storage: "${nomeArquivoLocal}" → "${nomeArquivo}"`
      );
    }

    try {
      const tamanhoLocal = obterTamanhoArquivo(caminhoLocal);

      if (tamanhoLocal > MAX_SIZE_BYTES) {
        resumo.ignoradosPorTamanho += 1;
        console.warn(
          `[Sync Catálogos] Ignorado por tamanho (> ${LIMITE_MB} MB): ${fornecedorSlug}/${nomeArquivo}`
        );
        continue;
      }

      const tamanhoRemoto = indiceRemoto.get(nomeArquivo);

      if (tamanhoRemoto !== undefined && tamanhoRemoto === tamanhoLocal) {
        resumo.ignorados += 1;
        continue;
      }

      const ehAtualizacao = tamanhoRemoto !== undefined && tamanhoRemoto !== tamanhoLocal;

      await enviarPdfParaStorage(caminhoLocal, fornecedorSlug, nomeArquivo, ehAtualizacao);

      if (ehAtualizacao) {
        resumo.atualizados += 1;
        console.log(`[Sync Catálogos] Atualizado: ${fornecedorSlug}/catalogos/${nomeArquivo}`);
      } else {
        resumo.novos += 1;
        console.log(`[Sync Catálogos] Novo: ${fornecedorSlug}/catalogos/${nomeArquivo}`);
      }

      resumo.pdfsParaImportar.push({
        fornecedorSlug,
        nomeArquivo,
        acao: ehAtualizacao ? 'atualizado' : 'novo',
      });
    } catch (error) {
      resumo.erros += 1;
      console.error(`[Sync Catálogos] Erro em ${fornecedorSlug}/${nomeArquivo}:`, error.message);
    }
  }
}

function imprimirResumoFinal(resumo) {
  const tempoSegundos = ((Date.now() - resumo.inicio) / 1000).toFixed(1);

  console.log(`
========================================
SINCRONIZAÇÃO DE CATÁLOGOS FINALIZADA
========================================
Biblioteca:
${resumo.biblioteca || '(não encontrada)'}

Origem:
${resumo.origem}

Novos:
${resumo.novos}

Atualizados:
${resumo.atualizados}

Ignorados:
${resumo.ignorados}

Ignorados (>150MB):
${resumo.ignoradosPorTamanho}

Erros:
${resumo.erros}

PDFs para importar:
${resumo.pdfsParaImportar.length}

Tempo:
${tempoSegundos}s
========================================
`);
}

/**
 * Sincroniza PDFs da biblioteca oficial do OneDrive para o Supabase Storage.
 * @param {{ origem?: string }} opcoes
 * @returns {Promise<object>} Resumo da execução com pdfsParaImportar.
 */
export async function sincronizarCatalogosStorage({ origem = 'startup' } = {}) {
  if (sincronizacaoEmAndamento) {
    console.warn('[Sync Catálogos] Sincronização já em andamento neste processo. Ignorando.');
    return { pdfsParaImportar: [] };
  }

  sincronizacaoEmAndamento = true;

  const resumo = {
    origem,
    biblioteca: null,
    inicio: Date.now(),
    novos: 0,
    atualizados: 0,
    ignorados: 0,
    ignoradosPorTamanho: 0,
    erros: 0,
    pdfsParaImportar: [],
  };

  console.log(`[Sync Catálogos] Início (origem: ${origem}).`);

  try {
    if (!supabase) {
      console.warn('[Sync Catálogos] Supabase não inicializado. Sincronização ignorada.');
      return resumo;
    }

    const bibliotecaRaiz = resolverBibliotecaCatalogos();
    if (!bibliotecaRaiz) {
      console.warn('[Sync Catálogos] Biblioteca oficial não encontrada. Sincronização ignorada.');
      return resumo;
    }

    resumo.biblioteca = bibliotecaRaiz;
    console.log(`[Sync Catálogos] Biblioteca: ${bibliotecaRaiz}`);

    const pastasFornecedores = fs
      .readdirSync(bibliotecaRaiz, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name);

    for (const nomePasta of pastasFornecedores) {
      try {
        await sincronizarFornecedor(bibliotecaRaiz, nomePasta, resumo);
      } catch (error) {
        resumo.erros += 1;
        console.error(`[Sync Catálogos] Erro no fornecedor ${nomePasta}:`, error.message);
      }
    }
  } catch (error) {
    resumo.erros += 1;
    console.error('[Sync Catálogos] Erro geral:', error.message);
  } finally {
    sincronizacaoEmAndamento = false;
    imprimirResumoFinal(resumo);
  }

  return resumo;
}
