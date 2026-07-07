import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VERSAO_EXTRATOR_PRODUTO } from './normalizarProdutoComercial.js';

const __filename = fileURLToPath(import.meta.url);
const SERVICE_DIR = path.resolve(path.dirname(__filename), '..', '..');
export const CACHE_DIR = path.join(SERVICE_DIR, 'output', 'cache-inteligencia-comercial');

export const TIPOS_CACHE = {
  CLASSIFICACAO_PAGINA: 'classificacao_pagina',
  ATRIBUTOS_VISUAIS: 'atributos_visuais',
};

function garantirCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function gerarHashConteudoImagem(caminhoImagem) {
  const buffer = fs.readFileSync(caminhoImagem);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Chave estável por versão do extrator + SHA-256 do conteúdo do PNG.
 * Formato: v1.0.0__{sha256}
 */
export function gerarChaveCacheImagem(caminhoImagem = '') {
  const hash = gerarHashConteudoImagem(caminhoImagem);
  return `${VERSAO_EXTRATOR_PRODUTO}__${hash}`;
}

function caminhoArquivoCache(chaveImagem, tipoCache) {
  return path.join(CACHE_DIR, `${chaveImagem}__${tipoCache}.json`);
}

export function lerCacheAuditoria(caminhoImagem, tipoCache) {
  if (!caminhoImagem || !fs.existsSync(caminhoImagem)) return null;

  garantirCacheDir();
  const chave = gerarChaveCacheImagem(caminhoImagem);
  const arquivo = caminhoArquivoCache(chave, tipoCache);

  if (!fs.existsSync(arquivo)) return null;

  try {
    const envelope = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

    if (envelope.tipoCache && envelope.tipoCache !== tipoCache) {
      return null;
    }

    const payload = envelope?.conteudo ?? envelope;

    return {
      chave: envelope.chave || chave,
      arquivo,
      conteudo: payload,
      metadados: {
        versao_extrator: envelope.versao_extrator || null,
        tipoCache: envelope.tipoCache || tipoCache,
        salvo_em: envelope.salvo_em || null,
      },
      fonte: 'cache',
    };
  } catch {
    return null;
  }
}

export function salvarCacheAuditoria(caminhoImagem, tipoCache, conteudo) {
  if (!caminhoImagem || !fs.existsSync(caminhoImagem)) return null;

  garantirCacheDir();
  const chave = gerarChaveCacheImagem(caminhoImagem);
  const arquivo = caminhoArquivoCache(chave, tipoCache);

  fs.writeFileSync(arquivo, JSON.stringify({
    chave,
    versao_extrator: VERSAO_EXTRATOR_PRODUTO,
    tipoCache,
    salvo_em: new Date().toISOString(),
    conteudo,
  }, null, 2), 'utf8');

  return arquivo;
}
