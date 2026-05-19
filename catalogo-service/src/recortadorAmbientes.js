import { OpenAI } from 'openai';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); // Fallback caso execute dentro de catalogo-service/

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'mock-key-para-validacao-de-import'
});

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
    const imagemBase64 = fs.readFileSync(caminhoImagemLocal).toString('base64');
    
    const prompt = `
Você é um sistema especializado em processamento visual de catálogos de revestimentos/porcelanatos.
Analise a imagem da página fornecida. Seu objetivo é identificar APENAS as seções ou retângulos que representam fotos de AMBIENTES REAIS ou DECORADOS (como banheiros, salas, cozinhas revestidas com o produto).

Regras de Detecção:
1. Ignore amostras puras do porcelanato (amostras quadradas ou texturas chapadas sem perspectiva).
2. Ignore textos, tabelas técnicas, logotipos ou cabeçalhos.
3. Se você identificar fotos de ambientes reais revestidos, retorne a coordenada de corte normalizada de 0 a 1000.
4. Caso a imagem esteja confusa, as divisões não estejam claras, ou você não tenha certeza se é um ambiente decorado ou apenas uma textura grande, defina a "confianca_geral" como "baixa" e descreva o motivo.

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

    const response = await openai.chat.completions.create({
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
    });

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

  const outputDir = path.resolve(`catalogo-service/output/ambientes/${outputDirName}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const recortes = [];
  
  try {
    // Carrega a imagem original usando loadImage do @napi-rs/canvas
    const image = await loadImage(caminhoImagemLocal);
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
      if (w < 60 || h < 60) {
        console.log(`⚠️ Recorte #${i+1} muito pequeno (${w}x${h}px), pulando.`);
        continue;
      }

      const outputFilename = `pagina_${path.basename(caminhoImagemLocal, '.png')}_ambiente_${i + 1}.png`;
      const outputPath = path.join(outputDir, outputFilename);

      console.log(`✂️ Recortando regiao com N-API Canvas (Rust): [left: ${left}, top: ${top}, width: ${w}, height: ${h}] -> ${outputFilename}`);

      // Cria um canvas temporario com as dimensoes do recorte
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');

      // Desenha a secao recortada no canvas
      ctx.drawImage(image, left, top, w, h, 0, 0, w, h);

      // Converte para Buffer e escreve localmente
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(outputPath, buffer);

      recortes.push({
        descricao: amb.descricao || `Ambiente Recortado ${i + 1}`,
        caminhoLocal: outputPath,
        nomeArquivo: outputFilename,
        coordenadas: { left, top, width: w, height: h }
      });
    }
  } catch (error) {
    console.error('❌ Erro ao recortar imagem com Canvas:', error.message);
  }

  return recortes;
}
