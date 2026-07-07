import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MIN_TEXTO_SUFICIENTE = 80;

export async function extrairTextoPaginaPdf(pdfPath, numeroPagina) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDocument = await loadingTask.promise;
  const page = await pdfDocument.getPage(numeroPagina);
  const textContent = await page.getTextContent();

  const texto = textContent.items
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const caracteres = texto.length;
  const textoSuficiente = caracteres >= MIN_TEXTO_SUFICIENTE;

  return {
    texto,
    caracteres,
    textoSuficiente,
    origem: textoSuficiente ? 'pdf_texto' : 'pdf_texto_insuficiente',
    avisoOcr: textoSuficiente
      ? null
      : 'Texto PDF insuficiente. OCR não disponível nesta sprint; Vision complementará apenas atributos visuais.',
  };
}
