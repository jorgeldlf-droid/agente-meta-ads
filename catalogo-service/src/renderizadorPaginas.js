import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';

/**
 * Renderiza paginas do PDF como imagens locais PNG usando pdfjs-dist e @napi-rs/canvas
 * 
 * @param {string} pdfPath - Caminho local do arquivo PDF
 * @param {string} outputDirName - Nome da subpasta de saida (geralmente o nome limpo do catalogo)
 * @param {number} limitePaginas - Limite maximo de paginas a processar (para testes)
 * @returns {Promise<Array>} Lista de metadados das paginas renderizadas
 */
export async function renderizarPaginasPdf(pdfPath, outputDirName, limitePaginas = 3) {
  const outputDir = path.resolve(`catalogo-service/output/paginas/${outputDirName}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`🖼️ Renderizando paginas do PDF: ${path.basename(pdfPath)} (Limite maximo: ${limitePaginas} paginas)`);

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  
  // Inicializa o getDocument da versao legada do pdf.js
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true, // Evita problemas de carregamento de fontes no ambiente Node
  });
  
  const pdfDocument = await loadingTask.promise;
  const totalPaginas = pdfDocument.numPages;
  const paginasParaProcessar = Math.min(totalPaginas, limitePaginas);
  
  console.log(`📄 Total de paginas do PDF: ${totalPaginas}. Processando as primeiras ${paginasParaProcessar} paginas.`);

  const paginasGeradas = [];

  for (let i = 1; i <= paginasParaProcessar; i++) {
    console.log(`   -> Renderizando pagina ${i}...`);
    const page = await pdfDocument.getPage(i);
    
    // Escala 2.0 para garantir uma resolucao excelente para visualizacao e deteccao por IA
    const viewport = page.getViewport({ scale: 2.0 }); 

    // Cria o canvas usando o @napi-rs/canvas (Rust compile-free N-API)
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // Executa a renderizacao da pagina no canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;

    const outputFilename = `pagina_${i}.png`;
    const outputPath = path.join(outputDir, outputFilename);

    // Converte o canvas para Buffer PNG e grava localmente
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`   ✅ Pagina ${i} salva em: ${outputPath} (${viewport.width}x${viewport.height}px)`);

    paginasGeradas.push({
      numero: i,
      caminhoLocal: outputPath,
      nomeArquivo: outputFilename
    });
  }

  return paginasGeradas;
}
