import fs from 'fs';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import {
  lerCacheAuditoria,
  salvarCacheAuditoria,
  TIPOS_CACHE,
} from './cacheAuditoriaComercial.js';

dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key-para-validacao-de-import',
});

const CAMPOS_VISION = [
  'visual',
  'cor',
  'estilo',
  'categoria',
  'uso',
  'ambientes_indicados',
  'palavras_chave',
];

function camposFaltantes(camposTexto = {}) {
  return CAMPOS_VISION.filter((campo) => {
    const valor = camposTexto[campo];
    if (Array.isArray(valor)) return valor.length === 0;
    return valor === undefined || valor === null || String(valor).trim() === '';
  });
}

function registrarOrigem(origens, campo, origem) {
  if (!origens[campo]) origens[campo] = origem;
}

/**
 * Vision complementar: apenas atributos visuais.
 * Não extrai nome, coleção, linha, formato, espessura, acabamento ou retificado.
 */
export async function extrairAtributosVisuaisVision({
  caminhoImagem,
  camposTexto = {},
} = {}) {
  const origens = {};
  const faltantes = camposFaltantes(camposTexto);

  if (faltantes.length === 0) {
    return {
      complemento: {},
      origens,
      fonte: 'vision_pulada',
      motivo: 'Todos os atributos visuais já estavam preenchidos pelo texto.',
    };
  }

  if (!caminhoImagem || !fs.existsSync(caminhoImagem)) {
    return {
      complemento: {},
      origens,
      fonte: 'vision_pulada',
      motivo: 'Imagem da página indisponível.',
    };
  }

  const cache = lerCacheAuditoria(caminhoImagem, TIPOS_CACHE.ATRIBUTOS_VISUAIS);
  if (cache?.conteudo) {
    const complemento = cache.conteudo.complemento || {};
    const origensCache = cache.conteudo.origens || {};
    Object.assign(origens, origensCache);
    return {
      complemento,
      origens,
      fonte: 'vision_cache',
      motivo: 'Resultado reutilizado do cache local.',
      cache_arquivo: cache.arquivo,
    };
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key-para-validacao-de-import') {
    return {
      complemento: {},
      origens,
      fonte: 'vision_pulada',
      motivo: 'OPENAI_API_KEY ausente.',
    };
  }

  const imagemBase64 = fs.readFileSync(caminhoImagem).toString('base64');
  const prompt = `
Analise esta página de catálogo de porcelanato.
NÃO invente e NÃO retorne:
nome_produto, colecao, linha_produto, formato, espessura, acabamento, retificado.

Preencha SOMENTE os campos visuais/comerciais abaixo, se identificáveis:
{
  "visual": "Mármore|Madeira|Cimento|Pedra|Metal|Monocromático|Terrazzo|Outros",
  "cor": "Branco|Bege|Cinza claro|Cinza escuro|Preto|Marrom|Madeira|Colorido|Outros",
  "estilo": "Moderno|Contemporâneo|Clássico|Rústico|Industrial|Minimalista|Sofisticado|Natural|Outros",
  "categoria": "Premium|Standard|Econômico|Outros",
  "uso": "Interno|Externo|Interno e externo|Parede|Piso|Piso e parede|Outros",
  "ambientes_indicados": ["Sala","Cozinha","Banheiro"],
  "palavras_chave": ["marmore","claro"]
}
Retorne SOMENTE JSON. Campos incertos: omita ou use "Outros"/[].
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imagemBase64}` } },
      ],
    }],
  });

  const parsed = JSON.parse(response.choices[0].message.content.trim());
  const complemento = {};

  for (const campo of faltantes) {
    if (parsed[campo] !== undefined && parsed[campo] !== null && parsed[campo] !== '') {
      complemento[campo] = parsed[campo];
      registrarOrigem(origens, campo, 'vision');
    }
  }

  salvarCacheAuditoria(caminhoImagem, TIPOS_CACHE.ATRIBUTOS_VISUAIS, {
    complemento,
    origens,
  });

  return {
    complemento,
    origens,
    fonte: 'vision',
    motivo: 'Vision complementar executada.',
  };
}
