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

export const TIPOS_PAGINA = [
  'produto', 'capa', 'indice', 'institucional',
  'ambiente', 'especificacoes', 'tabela', 'outros',
];

const TIPOS_COMERCIAIS = new Set(['produto', 'especificacoes', 'tabela']);

const TERMOS_LOGISTICA_CLASSIFICACAO = [
  'pallet', 'pallets', 'por pallet', 'caixa', 'caixas', 'm2', 'm²', 'm3', 'm³',
  'pecas', 'peças', 'peso', 'kg', 'empilhamento', 'camada', 'camadas',
  'quantidade', 'qtd', 'embalagem', 'codigo', 'código', 'sku', 'ean',
];

function normalizarTexto(texto = '') {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function contarTermosLogisticos(texto = '') {
  const t = normalizarTexto(texto);
  let total = 0;
  for (const termo of TERMOS_LOGISTICA_CLASSIFICACAO) {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escapado}\\b`, 'i').test(t)) total += 1;
  }
  return total;
}

function temSinaisProdutoReal(texto = '') {
  const t = normalizarTexto(texto);
  const temFormato = /\d{2,3}\s*[x×]\s*\d{2,3}/.test(t);
  const temAcabamento = /\b(polido|acetinado|natural|mate|retificado|lappato)\b/.test(t);
  const temCodigoProduto = /\b[a-z][a-z0-9]+-\d{1,3}\b/i.test(texto);
  const temColecaoExplicita = /\b(colecao|coleção|collection|linha)\s*[:\-]/i.test(texto);
  return temFormato && (temAcabamento || temCodigoProduto || temColecaoExplicita);
}

function classificarPorHeuristica(texto = '') {
  const t = normalizarTexto(texto);

  if (/\b(indice|índice|sumario|sumário|contents)\b/.test(t)) {
    return { tipo: 'indice', confianca: 'alta', motivo: 'Palavras-chave de índice.' };
  }
  if (/\b(ficha tecnica|ficha técnica|especificacoes|especificações)\b/.test(t)) {
    return { tipo: 'especificacoes', confianca: 'alta', motivo: 'Ficha técnica detectada.' };
  }
  const termosLogisticos = contarTermosLogisticos(texto);
  if (termosLogisticos >= 2 && !temSinaisProdutoReal(texto)) {
    return {
      tipo: 'tabela',
      confianca: 'alta',
      motivo: 'Predominância de termos logísticos/tabela.',
    };
  }
  if (termosLogisticos >= 1 && /\b(pallet|por pallet|caixa|embalagem|peso)\b/.test(t) && /\d{2,3}\s*[x×]\s*\d{2,3}/.test(t)) {
    return {
      tipo: 'tabela',
      confianca: 'media',
      motivo: 'Tabela com formatos e dados logísticos.',
    };
  }
  if (/\b(tabela|codigo|cod\.|sku)\b/.test(t) && /\d{2,3}\s*[x×]\s*\d{2,3}/.test(t)) {
    return { tipo: 'tabela', confianca: 'media', motivo: 'Tabela com formatos.' };
  }
  if (/\b(ambiente|living|banheiro|cozinha|sala|suite|decorado)\b/.test(t) && !/\d{2,3}\s*[x×]\s*\d{2,3}/.test(t)) {
    return { tipo: 'ambiente', confianca: 'media', motivo: 'Página de ambiente.' };
  }
  if (/\b(historia|institucional|sobre a empresa|nossa historia)\b/.test(t)) {
    return { tipo: 'institucional', confianca: 'media', motivo: 'Conteúdo institucional.' };
  }
  if (/\d{2,3}\s*[x×]\s*\d{2,3}/.test(t) && /\b(polido|acetinado|natural|mate|retificado|mm)\b/.test(t)) {
    return { tipo: 'produto', confianca: 'alta', motivo: 'Formato e specs no texto.' };
  }
  if (t.length < 40) {
    return { tipo: 'capa', confianca: 'baixa', motivo: 'Pouco texto — possível capa.' };
  }

  return { tipo: 'outros', confianca: 'baixa', motivo: 'Sem padrão claro no texto.' };
}

async function classificarPorVision(caminhoImagem) {
  const cache = lerCacheAuditoria(caminhoImagem, TIPOS_CACHE.CLASSIFICACAO_PAGINA);
  if (cache?.conteudo?.classificacao) {
    return {
      ...cache.conteudo.classificacao,
      metodo: 'vision',
      fonte: 'vision_cache',
      cache_arquivo: cache.arquivo,
    };
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key-para-validacao-de-import') {
    return {
      tipo: 'outros',
      confianca: 'baixa',
      motivo: 'OPENAI_API_KEY ausente.',
      metodo: 'vision',
      fonte: 'vision_pulada',
    };
  }

  const imagemBase64 = fs.readFileSync(caminhoImagem).toString('base64');
  const prompt = `
Classifique o tipo desta página de catálogo de porcelanato.
Retorne SOMENTE JSON:
{
  "tipo": "produto|capa|indice|institucional|ambiente|especificacoes|tabela|outros",
  "confianca": "alta|media|baixa",
  "motivo": "breve justificativa"
}`;

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
  const classificacao = {
    tipo: TIPOS_PAGINA.includes(parsed.tipo) ? parsed.tipo : 'outros',
    confianca: ['alta', 'media', 'baixa'].includes(parsed.confianca) ? parsed.confianca : 'baixa',
    motivo: parsed.motivo || 'Classificação Vision.',
    metodo: 'vision',
    fonte: 'vision',
  };

  salvarCacheAuditoria(caminhoImagem, TIPOS_CACHE.CLASSIFICACAO_PAGINA, { classificacao });
  return classificacao;
}

/**
 * Heurística primeiro. Vision só se confiança ≠ alta.
 */
export async function classificarPaginaProduto({ texto = '', caminhoImagem = '' } = {}) {
  const heuristica = classificarPorHeuristica(texto);

  if (heuristica.confianca === 'alta') {
    return {
      ...heuristica,
      metodo: 'heuristica',
      fonte: 'vision_pulada',
    };
  }

  if (caminhoImagem && fs.existsSync(caminhoImagem)) {
    return classificarPorVision(caminhoImagem);
  }

  return {
    ...heuristica,
    metodo: 'heuristica',
    fonte: 'vision_pulada',
    motivo: `${heuristica.motivo} Imagem indisponível para Vision.`,
  };
}

export function paginaEhComercial(classificacao = {}) {
  return TIPOS_COMERCIAIS.has(classificacao.tipo)
    && ['alta', 'media'].includes(classificacao.confianca);
}
