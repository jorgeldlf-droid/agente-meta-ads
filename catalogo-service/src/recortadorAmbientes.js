import { OpenAI } from 'openai';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getAmbientesCatalogoDir } from './config/caminhos.js';

dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); // Fallback caso execute dentro de catalogo-service/

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key-para-validacao-de-import'
});

const POST_WIDTH = 1080;
const POST_HEIGHT = 1350;
const POST_ASPECT_RATIO = POST_WIDTH / POST_HEIGHT;
const MIN_CROP_SIDE = 60;
const EXPANSAO_CONTEXTUAL_RATIO = 0.04;
const MAX_AUMENTO_AREA_CLARA = 0.12;
const MAX_PERDA_SCORE_EXPANSAO = 0.15;
const TOLERANCIA_SCORE_CENTRAL = 0.08;
const PROPORCOES_FAIXA_EDITORIAL = [0.18, 0.24, 0.30, 0.34, 0.35];
const MIN_RESTANTE_APOS_REMOCAO = 0.62;
const MAX_SATURACAO_EDITORIAL = 0.28;
const FATOR_MAX_SATURACAO_EDITORIAL = 0.90;
const DIFERENCA_MINIMA_AREA_CLARA = 0.15;
const FATOR_MAX_TEXTURA_EDITORIAL = 0.72;
const FATOR_MAX_VARIANCIA_EDITORIAL = 0.75;
const DIFERENCA_MINIMA_SCORE_EDITORIAL = 0.08;
const MIN_INDICADORES_EDITORIAIS = 2;
const GANHO_MINIMO_SCORE_REMOCAO = 0.10;
const PROPORCOES_DIVISAO_LAYOUT = [0.35, 0.40, 0.50, 0.60, 0.65];
const MIN_RESTANTE_LAYOUT_DIVIDIDO = 0.35;
const MIN_BLOCOS_UNIFORMES_FICHA = 0.55;
const DIFERENCA_MINIMA_BLOCOS_UNIFORMES = 0.15;
const MIN_INDICADORES_FICHA_TECNICA = 3;
const GANHO_MINIMO_SCORE_LAYOUT_DIVIDIDO = 0.15;
const TOLERANCIA_SCORE_LAYOUT_DIVIDIDO = 0.05;

const TENTATIVAS_ABERTURA_ARQUIVO = 3;
const DELAY_RETRY_ABERTURA_MS = 500;
const TENTATIVAS_OPENAI_VISION = 5;
const DELAY_RETRY_OPENAI_BASE_MS = 2000;
const DELAY_RETRY_OPENAI_MAX_MS = 60000;
const BUFFER_DELAY_OPENAI_MS = 100;
const INTERVALO_MINIMO_OPENAI_VISION_MS = 5000;
let ultimaChamadaOpenAIVisionMs = 0;

async function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function executarComRetryAbertura(acao) {
  for (let tentativa = 1; tentativa <= TENTATIVAS_ABERTURA_ARQUIVO; tentativa++) {
    try {
      return await acao();
    } catch (error) {
      if (tentativa === TENTATIVAS_ABERTURA_ARQUIVO) throw error;
      await aguardar(DELAY_RETRY_ABERTURA_MS);
    }
  }
}

function isErroRateLimitOpenAI(error) {
  const status = error?.status;
  const code = error?.code;
  const mensagem = String(error?.message || '');
  return status === 429
    || code === 'rate_limit_exceeded'
    || mensagem.includes('429')
    || /rate limit reached/i.test(mensagem);
}

function extrairDelayRetryOpenAIMs(error) {
  const mensagem = String(error?.message || '');
  const match = mensagem.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (!match) return null;

  const valor = parseFloat(match[1]);
  if (Number.isNaN(valor)) return null;

  const ms = match[2].toLowerCase() === 's' ? valor * 1000 : valor;
  return Math.ceil(ms) + BUFFER_DELAY_OPENAI_MS;
}

async function executarComRetryOpenAI(acao, contexto = 'OpenAI Vision') {
  for (let tentativa = 1; tentativa <= TENTATIVAS_OPENAI_VISION; tentativa++) {
    try {
      return await acao();
    } catch (error) {
      const ehRateLimit = isErroRateLimitOpenAI(error);
      const esgotouTentativas = tentativa === TENTATIVAS_OPENAI_VISION;

      if (!ehRateLimit || esgotouTentativas) {
        throw error;
      }

      const delayApi = extrairDelayRetryOpenAIMs(error);
      const backoffExponencial = DELAY_RETRY_OPENAI_BASE_MS * Math.pow(2, tentativa - 1);
      const delay = Math.min(
        delayApi ? Math.max(delayApi, backoffExponencial) : backoffExponencial,
        DELAY_RETRY_OPENAI_MAX_MS
      );

      console.warn(
        `⚠️ [${contexto}] Rate limit 429 (tentativa ${tentativa}/${TENTATIVAS_OPENAI_VISION}). Aguardando ${delay}ms...`
      );
      await aguardar(delay);
    }
  }
}

async function aguardarIntervaloMinimoOpenAIVision() {
  const agora = Date.now();
  const decorrido = agora - ultimaChamadaOpenAIVisionMs;
  const restante = INTERVALO_MINIMO_OPENAI_VISION_MS - decorrido;

  if (ultimaChamadaOpenAIVisionMs > 0 && restante > 0) {
    console.log(`⏳ [IA Vision] Aguardando ${restante}ms para respeitar intervalo mínimo...`);
    await aguardar(restante);
  }

  ultimaChamadaOpenAIVisionMs = Date.now();
}

function limitarValor(valor, minimo, maximo) {
  return Math.min(Math.max(valor, minimo), maximo);
}

function criarCropCentralizado4x5(left, top, width, height) {
  let cropW = width;
  let cropH = Math.round(width / POST_ASPECT_RATIO);

  if (cropH > height) {
    cropH = height;
    cropW = Math.round(height * POST_ASPECT_RATIO);
  }

  return {
    left: left + Math.round((width - cropW) / 2),
    top: top + Math.round((height - cropH) / 2),
    width: cropW,
    height: cropH
  };
}

function gerarCandidatosCrop4x5(left, top, width, height) {
  const cropBase = criarCropCentralizado4x5(left, top, width, height);
  const candidatos = [cropBase];

  if (width / height > POST_ASPECT_RATIO) {
    const cropW = cropBase.width;
    const posicoesX = [
      left,
      left + Math.round((width - cropW) * 0.25),
      left + Math.round((width - cropW) * 0.5),
      left + Math.round((width - cropW) * 0.75),
      left + width - cropW
    ];

    for (const x of posicoesX) {
      candidatos.push({
        left: limitarValor(x, left, left + width - cropW),
        top: cropBase.top,
        width: cropW,
        height: cropBase.height
      });
    }
  } else if (width / height < POST_ASPECT_RATIO) {
    const cropH = cropBase.height;
    const posicoesY = [
      top,
      top + Math.round((height - cropH) * 0.25),
      top + Math.round((height - cropH) * 0.5),
      top + Math.round((height - cropH) * 0.75),
      top + height - cropH
    ];

    for (const y of posicoesY) {
      candidatos.push({
        left: cropBase.left,
        top: limitarValor(y, top, top + height - cropH),
        width: cropBase.width,
        height: cropH
      });
    }
  }

  const unicos = new Map();
  for (const candidato of candidatos) {
    const chave = `${candidato.left}:${candidato.top}:${candidato.width}:${candidato.height}`;
    unicos.set(chave, candidato);
  }

  return [...unicos.values()];
}

function calcularMetricasFotograficas(ctx, crop) {
  const sampleW = 48;
  const sampleH = 60;
  const canvas = createCanvas(sampleW, sampleH);
  const sampleCtx = canvas.getContext('2d');

  sampleCtx.drawImage(
    ctx.canvas,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    sampleW,
    sampleH
  );

  const pixels = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  let somaBrilho = 0;
  let somaBrilhoQuadrado = 0;
  let somaSaturacao = 0;
  let areaClara = 0;
  let transicoes = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brilho = (r + g + b) / 3;
    const saturacao = max === 0 ? 0 : (max - min) / max;

    somaBrilho += brilho;
    somaBrilhoQuadrado += brilho * brilho;
    somaSaturacao += saturacao;

    if (brilho > 238 && saturacao < 0.12) {
      areaClara++;
    }
  }

  for (let y = 1; y < sampleH; y += 2) {
    for (let x = 1; x < sampleW; x += 2) {
      const atual = (y * sampleW + x) * 4;
      const anterior = (y * sampleW + x - 1) * 4;
      const acima = ((y - 1) * sampleW + x) * 4;

      const brilhoAtual = (pixels[atual] + pixels[atual + 1] + pixels[atual + 2]) / 3;
      const brilhoAnterior = (pixels[anterior] + pixels[anterior + 1] + pixels[anterior + 2]) / 3;
      const brilhoAcima = (pixels[acima] + pixels[acima + 1] + pixels[acima + 2]) / 3;

      transicoes += Math.abs(brilhoAtual - brilhoAnterior) + Math.abs(brilhoAtual - brilhoAcima);
    }
  }

  const totalPixels = sampleW * sampleH;
  const mediaBrilho = somaBrilho / totalPixels;
  const variancia = (somaBrilhoQuadrado / totalPixels) - (mediaBrilho * mediaBrilho);
  const mediaSaturacao = somaSaturacao / totalPixels;
  const proporcaoClara = areaClara / totalPixels;
  const textura = transicoes / totalPixels;

  const colunasBloco = 6;
  const linhasBloco = 6;
  const larguraBloco = Math.floor(sampleW / colunasBloco);
  const alturaBloco = Math.floor(sampleH / linhasBloco);
  let blocosUniformes = 0;

  for (let blocoY = 0; blocoY < linhasBloco; blocoY++) {
    for (let blocoX = 0; blocoX < colunasBloco; blocoX++) {
      let brilhoMinimo = 255;
      let brilhoMaximo = 0;

      for (let y = blocoY * alturaBloco; y < (blocoY + 1) * alturaBloco; y++) {
        for (let x = blocoX * larguraBloco; x < (blocoX + 1) * larguraBloco; x++) {
          const indice = (y * sampleW + x) * 4;
          const brilho =
            (pixels[indice] + pixels[indice + 1] + pixels[indice + 2]) / 3;

          brilhoMinimo = Math.min(brilhoMinimo, brilho);
          brilhoMaximo = Math.max(brilhoMaximo, brilho);
        }
      }

      if (brilhoMaximo - brilhoMinimo < 28) {
        blocosUniformes++;
      }
    }
  }

  return {
    proporcaoClara,
    mediaSaturacao,
    textura,
    variancia,
    proporcaoBlocosUniformes:
      blocosUniformes / (colunasBloco * linhasBloco),
    score:
      variancia * 0.55 +
      mediaSaturacao * 180 +
      textura * 0.45 -
      proporcaoClara * 40
  };
}

function pontuarCropFotografico(ctx, crop) {
  return calcularMetricasFotograficas(ctx, crop).score;
}

function criarAreaSemFaixaLateral(area, lado, proporcao) {
  const larguraFaixa = Math.round(area.width * proporcao);

  if (lado === 'esquerda') {
    return {
      faixa: {
        left: area.left,
        top: area.top,
        width: larguraFaixa,
        height: area.height
      },
      restante: {
        left: area.left + larguraFaixa,
        top: area.top,
        width: area.width - larguraFaixa,
        height: area.height
      }
    };
  }

  return {
    faixa: {
      left: area.left + area.width - larguraFaixa,
      top: area.top,
      width: larguraFaixa,
      height: area.height
    },
    restante: {
      left: area.left,
      top: area.top,
      width: area.width - larguraFaixa,
      height: area.height
    }
  };
}

function faixaPareceEditorial(metricasFaixa, metricasRestante) {
  const baixaSaturacao =
    metricasFaixa.mediaSaturacao <= MAX_SATURACAO_EDITORIAL &&
    metricasFaixa.mediaSaturacao <=
      metricasRestante.mediaSaturacao * FATOR_MAX_SATURACAO_EDITORIAL;
  const indicadoresEditorais = [
    metricasFaixa.proporcaoClara >=
      metricasRestante.proporcaoClara + DIFERENCA_MINIMA_AREA_CLARA,
    metricasFaixa.textura <=
      metricasRestante.textura * FATOR_MAX_TEXTURA_EDITORIAL,
    metricasFaixa.variancia <=
      metricasRestante.variancia * FATOR_MAX_VARIANCIA_EDITORIAL,
    metricasFaixa.score <=
      metricasRestante.score -
        Math.max(
          6,
          Math.abs(metricasRestante.score) *
            DIFERENCA_MINIMA_SCORE_EDITORIAL
        )
  ].filter(Boolean).length;

  return baixaSaturacao && indicadoresEditorais >= MIN_INDICADORES_EDITORIAIS;
}

function removerColunaEditorialLateral(ctx, area) {
  const metricasOriginais = calcularMetricasFotograficas(ctx, area);
  const ganhoMinimo =
    Math.max(8, Math.abs(metricasOriginais.score) * GANHO_MINIMO_SCORE_REMOCAO);
  const candidatos = [];

  for (const lado of ['esquerda', 'direita']) {
    for (const proporcao of PROPORCOES_FAIXA_EDITORIAL) {
      const { faixa, restante } = criarAreaSemFaixaLateral(
        area,
        lado,
        proporcao
      );
      const larguraMinimaRestante = Math.max(
        MIN_CROP_SIDE,
        Math.round(area.width * MIN_RESTANTE_APOS_REMOCAO)
      );

      if (restante.width < larguraMinimaRestante) {
        continue;
      }

      const metricasFaixa = calcularMetricasFotograficas(ctx, faixa);
      const metricasRestante = calcularMetricasFotograficas(ctx, restante);

      if (
        !faixaPareceEditorial(metricasFaixa, metricasRestante) ||
        metricasRestante.score < metricasOriginais.score + ganhoMinimo
      ) {
        continue;
      }

      candidatos.push({
        lado,
        proporcao,
        restante,
        score: metricasRestante.score
      });
    }
  }

  if (candidatos.length === 0) {
    console.log(
      `📐 Coluna editorial mantida: nenhuma faixa lateral passou na validação visual em [${area.left}, ${area.top}, ${area.width}, ${area.height}]`
    );
    return area;
  }

  const melhorCandidato = candidatos.sort(
    (a, b) => b.score - a.score || a.proporcao - b.proporcao
  )[0];

  console.log(
    `📐 Coluna editorial removida à ${melhorCandidato.lado}, proporção ${(melhorCandidato.proporcao * 100).toFixed(0)}%: original [${area.left}, ${area.top}, ${area.width}, ${area.height}], final [${melhorCandidato.restante.left}, ${melhorCandidato.restante.top}, ${melhorCandidato.restante.width}, ${melhorCandidato.restante.height}]`
  );

  return melhorCandidato.restante;
}

function criarAreasPorDivisaoVertical(area, proporcaoEsquerda) {
  const larguraEsquerda = Math.round(area.width * proporcaoEsquerda);

  return {
    esquerda: {
      left: area.left,
      top: area.top,
      width: larguraEsquerda,
      height: area.height
    },
    direita: {
      left: area.left + larguraEsquerda,
      top: area.top,
      width: area.width - larguraEsquerda,
      height: area.height
    }
  };
}

function ladoPareceFichaTecnica(metricasFicha, metricasAmbiente) {
  const baixaSaturacao =
    metricasFicha.mediaSaturacao <= MAX_SATURACAO_EDITORIAL &&
    metricasFicha.mediaSaturacao <=
      metricasAmbiente.mediaSaturacao * FATOR_MAX_SATURACAO_EDITORIAL;
  const muitosBlocosUniformes =
    metricasFicha.proporcaoBlocosUniformes >=
      MIN_BLOCOS_UNIFORMES_FICHA &&
    metricasFicha.proporcaoBlocosUniformes >=
      metricasAmbiente.proporcaoBlocosUniformes +
        DIFERENCA_MINIMA_BLOCOS_UNIFORMES;
  const indicadoresFicha = [
    baixaSaturacao,
    muitosBlocosUniformes,
    metricasFicha.proporcaoClara >=
      metricasAmbiente.proporcaoClara + DIFERENCA_MINIMA_AREA_CLARA,
    metricasFicha.textura <=
      metricasAmbiente.textura * FATOR_MAX_TEXTURA_EDITORIAL,
    metricasFicha.variancia <=
      metricasAmbiente.variancia * FATOR_MAX_VARIANCIA_EDITORIAL,
    metricasFicha.score <=
      metricasAmbiente.score -
        Math.max(
          10,
          Math.abs(metricasAmbiente.score) *
            DIFERENCA_MINIMA_SCORE_EDITORIAL
        )
  ].filter(Boolean).length;

  return (
    (baixaSaturacao || muitosBlocosUniformes) &&
    indicadoresFicha >= MIN_INDICADORES_FICHA_TECNICA
  );
}

function removerAreaTecnicaEmLayoutDividido(ctx, area) {
  const metricasOriginais = calcularMetricasFotograficas(ctx, area);
  const larguraMinimaAmbiente = Math.max(
    MIN_CROP_SIDE,
    Math.round(area.width * MIN_RESTANTE_LAYOUT_DIVIDIDO)
  );
  const ganhoMinimo =
    Math.max(
      12,
      Math.abs(metricasOriginais.score) *
        GANHO_MINIMO_SCORE_LAYOUT_DIVIDIDO
    );
  const candidatos = [];

  for (const proporcaoEsquerda of PROPORCOES_DIVISAO_LAYOUT) {
    const { esquerda, direita } = criarAreasPorDivisaoVertical(
      area,
      proporcaoEsquerda
    );

    if (
      esquerda.width < larguraMinimaAmbiente ||
      direita.width < larguraMinimaAmbiente
    ) {
      continue;
    }

    const metricasEsquerda = calcularMetricasFotograficas(ctx, esquerda);
    const metricasDireita = calcularMetricasFotograficas(ctx, direita);
    const opcoes = [
      {
        ladoFicha: 'esquerda',
        ficha: metricasEsquerda,
        ambiente: direita,
        metricasAmbiente: metricasDireita
      },
      {
        ladoFicha: 'direita',
        ficha: metricasDireita,
        ambiente: esquerda,
        metricasAmbiente: metricasEsquerda
      }
    ];

    for (const opcao of opcoes) {
      if (
        !ladoPareceFichaTecnica(opcao.ficha, opcao.metricasAmbiente) ||
        opcao.metricasAmbiente.score <
          metricasOriginais.score + ganhoMinimo
      ) {
        continue;
      }

      candidatos.push({
        ...opcao,
        proporcaoEsquerda,
        score: opcao.metricasAmbiente.score
      });
    }
  }

  if (candidatos.length === 0) {
    console.log(
      `📐 Área de amostras/ficha técnica mantida: divisões sem contraste fotográfico suficiente em [${area.left}, ${area.top}, ${area.width}, ${area.height}]`
    );
    return area;
  }

  const melhorScore = Math.max(...candidatos.map(({ score }) => score));
  const tolerancia = Math.max(
    8,
    Math.abs(melhorScore) * TOLERANCIA_SCORE_LAYOUT_DIVIDIDO
  );
  const melhorCandidato = candidatos
    .filter(({ score }) => score >= melhorScore - tolerancia)
    .sort(
      (a, b) =>
        b.ambiente.width - a.ambiente.width ||
        b.score - a.score
    )[0];
  const ladoAmbiente =
    melhorCandidato.ladoFicha === 'esquerda' ? 'direita' : 'esquerda';
  const proporcaoDireita = 1 - melhorCandidato.proporcaoEsquerda;

  console.log(
    `📐 Área de amostras/ficha técnica removida à ${melhorCandidato.ladoFicha}, divisão ${(melhorCandidato.proporcaoEsquerda * 100).toFixed(0)}/${(proporcaoDireita * 100).toFixed(0)}: ambiente mantido à ${ladoAmbiente}, original [${area.left}, ${area.top}, ${area.width}, ${area.height}], final [${melhorCandidato.ambiente.left}, ${melhorCandidato.ambiente.top}, ${melhorCandidato.ambiente.width}, ${melhorCandidato.ambiente.height}]`
  );

  return melhorCandidato.ambiente;
}

function expandirCaixaDetectadaComSeguranca(ctx, left, top, width, height) {
  const margemX = Math.round(width * EXPANSAO_CONTEXTUAL_RATIO);
  const margemY = Math.round(height * EXPANSAO_CONTEXTUAL_RATIO);

  if (margemX === 0 && margemY === 0) {
    return { left, top, width, height };
  }

  const expandedLeft = Math.max(0, left - margemX);
  const expandedTop = Math.max(0, top - margemY);
  const expandedRight = Math.min(ctx.canvas.width, left + width + margemX);
  const expandedBottom = Math.min(ctx.canvas.height, top + height + margemY);

  const original = { left, top, width, height };
  const expanded = {
    left: expandedLeft,
    top: expandedTop,
    width: expandedRight - expandedLeft,
    height: expandedBottom - expandedTop
  };

  const metricasOriginais = calcularMetricasFotograficas(ctx, original);
  const metricasExpandidas = calcularMetricasFotograficas(ctx, expanded);
  const scoreMinimoAceitavel =
    metricasOriginais.score -
    Math.max(
      10,
      Math.abs(metricasOriginais.score) * MAX_PERDA_SCORE_EXPANSAO
    );

  if (
    metricasExpandidas.proporcaoClara >
      metricasOriginais.proporcaoClara + MAX_AUMENTO_AREA_CLARA ||
    metricasExpandidas.score < scoreMinimoAceitavel
  ) {
    console.log(
      `📐 Expansão contextual descartada: original [${original.left}, ${original.top}, ${original.width}, ${original.height}], expandida [${expanded.left}, ${expanded.top}, ${expanded.width}, ${expanded.height}]`
    );
    return original;
  }

  console.log(
    `📐 Expansão contextual mantida: original [${original.left}, ${original.top}, ${original.width}, ${original.height}], expandida [${expanded.left}, ${expanded.top}, ${expanded.width}, ${expanded.height}]`
  );
  return expanded;
}

function distanciaDoCentro(crop, left, top, width, height) {
  const centroCropX = crop.left + crop.width / 2;
  const centroCropY = crop.top + crop.height / 2;
  const centroAreaX = left + width / 2;
  const centroAreaY = top + height / 2;

  return Math.hypot(centroCropX - centroAreaX, centroCropY - centroAreaY);
}

function escolherCropPostInstagram(ctx, left, top, width, height) {
  const fallback = criarCropCentralizado4x5(left, top, width, height);

  try {
    const candidatos = gerarCandidatosCrop4x5(left, top, width, height);
    const avaliados = candidatos
      .map((crop) => ({ crop, score: pontuarCropFotografico(ctx, crop) }))
      .sort((a, b) => b.score - a.score);
    const melhorScore = avaliados[0]?.score;
    const tolerancia = Math.max(
      8,
      Math.abs(melhorScore || 0) * TOLERANCIA_SCORE_CENTRAL
    );

    return avaliados
      .filter(({ score }) => score >= melhorScore - tolerancia)
      .sort((a, b) => distanciaDoCentro(a.crop, left, top, width, height) - distanciaDoCentro(b.crop, left, top, width, height))[0]?.crop || fallback;
  } catch (error) {
    console.warn('⚠️ Falha na heurística de crop fotográfico. Usando crop centralizado.', error.message);
    return fallback;
  }
}

/**
 * Envia a imagem da pagina para a API do OpenAI Vision para detectar ambientes.
 * Retorna as coordenadas e o nivel de confianca da analise.
 * 
 * @param {string} caminhoImagemLocal - Caminho da imagem da pagina inteira
 * @returns {Promise<Object>} JSON com a lista de ambientes e a confianca geral do crop
 */
export async function detectarAmbientesNaPagina(caminhoImagemLocal) {
  console.log(`🧠 [IA Vision] Analisando layout da pagina: ${path.basename(caminhoImagemLocal)}`);
  
  // Se a chave de API for a de mock ou nao estiver configurada
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock-key-para-validacao-de-import') {
    console.warn('⚠️ OPENAI_API_KEY nao configurada no .env. Pulando deteccao inteligente.');
    return { ambientes: [], confianca_geral: 'baixa', motivo_confianca: 'Chave API ausente' };
  }

  try {
    const imagemBase64 = (await executarComRetryAbertura(() =>
      fs.readFileSync(caminhoImagemLocal)
    )).toString('base64');
    
    const prompt = `
Você é um sistema especializado em processamento visual de catálogos de revestimentos/porcelanatos.
Analise a imagem da página fornecida. Seu objetivo é identificar APENAS a área fotográfica limpa de AMBIENTES REAIS ou DECORADOS (como banheiros, salas, cozinhas, quartos, varandas ou áreas gourmet revestidas com o produto).

Regras de Detecção:
1. Ignore amostras puras do porcelanato (amostras quadradas ou texturas chapadas sem perspectiva).
2. A bounding box deve excluir completamente texto, ficha técnica, título, logotipo, número de página, margem editorial, cabeçalho, rodapé, coluna explicativa e qualquer área de layout de catálogo.
3. Se houver uma foto de ambiente ao lado de uma coluna de texto, retorne somente a área da foto, sem incluir a coluna de texto.
4. Mantenha dentro da bounding box os elementos importantes do ambiente quando fizerem parte da foto: cuba, torneira, bancada, sofá, cama, mesa, louças, metais, armários, cadeiras, tapetes, plantas e decoração.
5. Não retorne a página inteira como ambiente. A página inteira só deve ser retornada se ela for exclusivamente uma foto limpa de ambiente, sem texto, ficha técnica, número de página, margem editorial ou elementos de catálogo.
6. Se não for possível separar claramente a foto do texto, ficha técnica ou área editorial, defina "confianca_geral" como "baixa" ou retorne nenhum ambiente.
7. Se você identificar fotos de ambientes reais revestidos, retorne a coordenada de corte normalizada de 0 a 1000, delimitando apenas a foto limpa do ambiente.
8. Caso a imagem esteja confusa, as divisões não estejam claras, ou você não tenha certeza se é um ambiente decorado ou apenas uma textura grande, defina a "confianca_geral" como "baixa" e descreva o motivo.

Retorne EXATAMENTE um objeto JSON estruturado no formato abaixo, sem nenhum tipo de formatação markdown, texto introdutório ou tag de código (ex: \`\`\`json):
{
  "confianca_geral": "alta" | "baixa",
  "motivo_confianca": "Breve justificativa caso seja baixa ou alta",
  "ambientes": [
    {
      "descricao": "Nome descritivo simples do ambiente (ex: Banheiro Decorado)",
      "ymin": 0 a 1000,
      "xmin": 0 a 1000,
      "ymax": 0 a 1000,
      "xmax": 0 a 1000
    }
  ]
}
Se não houver nenhum ambiente real decorado na página, retorne:
{
  "confianca_geral": "alta",
  "motivo_confianca": "Página técnica, capa ou sem imagens de ambientes",
  "ambientes": []
}
`;

    await aguardarIntervaloMinimoOpenAIVision();

    const response = await executarComRetryOpenAI(
      () => openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imagemBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
      'IA Vision'
    );

    const content = response.choices[0].message.content.trim();
    
    // Limpa qualquer encapsulamento markdown que a API possa retornar acidentalmente
    const cleanedContent = content
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();
      
    const result = JSON.parse(cleanedContent);
    
    console.log(`🤖 [IA Vision] Deteccao concluida. Confianca Geral: ${result.confianca_geral}. Ambientes encontrados: ${result.ambientes ? result.ambientes.length : 0}`);
    return result;
  } catch (error) {
    console.error('❌ Erro na conexao com a API OpenAI Vision:', error.message);
    return {
      confianca_geral: 'baixa',
      motivo_confianca: `Falha na execucao: ${error.message}`,
      ambientes: []
    };
  }
}

/**
 * Recorta as secoes detectadas da imagem base usando N-API Canvas (Rust)
 * @param {string} caminhoImagemLocal - Caminho da imagem original
 * @param {Array} ambientes - Lista de ambientes com coordenadas normalizadas (0 a 1000)
 * @param {string} outputDirName - Pasta para salvar os recortes
 * @returns {Promise<Array>} Lista de metadados dos recortes salvos
 */
export async function recortarAmbientes(caminhoImagemLocal, ambientes, outputDirName) {
  if (!ambientes || ambientes.length === 0) return [];

  const outputDir = getAmbientesCatalogoDir(outputDirName);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const recortes = [];
  
  try {
    // Carrega a imagem original usando loadImage do @napi-rs/canvas
    const image = await executarComRetryAbertura(() =>
      loadImage(caminhoImagemLocal)
    );
    const width = image.width;
    const height = image.height;

    for (let i = 0; i < ambientes.length; i++) {
      const amb = ambientes[i];
      
      // Converte a escala normalizada de 0-1000 para pixel real na imagem
      const left = Math.max(0, Math.round((amb.xmin / 1000) * width));
      const top = Math.max(0, Math.round((amb.ymin / 1000) * height));
      const w = Math.min(width - left, Math.round(((amb.xmax - amb.xmin) / 1000) * width));
      const h = Math.min(height - top, Math.round(((amb.ymax - amb.ymin) / 1000) * height));

      // Desconsidera recortes minusculos ou distorcoes
      if (w < MIN_CROP_SIDE || h < MIN_CROP_SIDE) {
        console.log(`⚠️ Recorte #${i+1} muito pequeno (${w}x${h}px), pulando.`);
        continue;
      }

      const outputFilename = `pagina_${path.basename(caminhoImagemLocal, '.png')}_ambiente_${i + 1}.png`;
      const outputPath = path.join(outputDir, outputFilename);

      console.log(`✂️ Recortando regiao com N-API Canvas (Rust): [left: ${left}, top: ${top}, width: ${w}, height: ${h}] -> ${outputFilename}`);

      const paginaCanvas = createCanvas(width, height);
      const paginaCtx = paginaCanvas.getContext('2d');
      paginaCtx.drawImage(image, 0, 0, width, height);

      const areaSemFichaTecnica = removerAreaTecnicaEmLayoutDividido(
        paginaCtx,
        {
          left,
          top,
          width: w,
          height: h
        }
      );
      const areaSemEditorial = removerColunaEditorialLateral(
        paginaCtx,
        areaSemFichaTecnica
      );
      const areaComContexto = expandirCaixaDetectadaComSeguranca(
        paginaCtx,
        areaSemEditorial.left,
        areaSemEditorial.top,
        areaSemEditorial.width,
        areaSemEditorial.height
      );
      const cropPost = escolherCropPostInstagram(
        paginaCtx,
        areaComContexto.left,
        areaComContexto.top,
        areaComContexto.width,
        areaComContexto.height
      );

      console.log(`ðŸ“ Crop final Instagram 4:5: [left: ${cropPost.left}, top: ${cropPost.top}, width: ${cropPost.width}, height: ${cropPost.height}] -> ${POST_WIDTH}x${POST_HEIGHT}`);

      // Cria a imagem final pronta para feed Instagram: 1080x1350, sem distorcer
      const canvas = createCanvas(POST_WIDTH, POST_HEIGHT);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(
        image,
        cropPost.left,
        cropPost.top,
        cropPost.width,
        cropPost.height,
        0,
        0,
        POST_WIDTH,
        POST_HEIGHT
      );

      // Converte para Buffer e escreve localmente
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(outputPath, buffer);

      recortes.push({
        descricao: amb.descricao || `Ambiente Recortado ${i + 1}`,
        caminhoLocal: outputPath,
        nomeArquivo: outputFilename,
        coordenadas: {
          areaSemFichaTecnica,
          areaSemEditorial,
          areaComContexto,
          origem: { left, top, width: w, height: h },
          cropFinal: cropPost,
          tamanhoFinal: { width: POST_WIDTH, height: POST_HEIGHT }
        }
      });
    }
  } catch (error) {
    console.error('❌ Erro ao recortar imagem com Canvas:', error.message);
  }

  return recortes;
}
