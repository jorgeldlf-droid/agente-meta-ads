import { supabase } from './supabaseClient.js';
import fs from 'fs';
import { BUCKET_CATALOGOS, montarCaminhoStorage } from './storagePastas.js';
import { TEMP_DIR, getTempPdfPath } from './config/caminhos.js';

/**
 * Faz o download de um PDF do Supabase Storage para processamento local
 * @param {string} fornecedor - Nome do fornecedor (ex: 'portinari')
 * @param {string} filename - Nome do arquivo PDF no storage
 * @returns {Promise<string>} Caminho local do PDF baixado
 */
export async function baixarPdfLocal(fornecedor, arquivoPdf) {
  const filename = typeof arquivoPdf === 'string' ? arquivoPdf : arquivoPdf.name;
  const remotePath = typeof arquivoPdf === 'object' && arquivoPdf.caminhoStorage
    ? arquivoPdf.caminhoStorage
    : await montarCaminhoStorage(supabase, fornecedor, 'catalogos', filename);
  const localDir = TEMP_DIR;
  
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  
  const localPath = getTempPdfPath(filename);
  console.log(`📥 Baixando arquivo do Supabase Storage: "${remotePath}" para "${localPath}"...`);

  const { data, error } = await supabase.storage
    .from(BUCKET_CATALOGOS)
    .download(remotePath);

  if (error) {
    console.error('❌ Erro no download do PDF do Storage:', error.message);
    throw error;
  }

  const arrayBuffer = await data.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
  console.log(`✅ Download concluido com sucesso. Salvo em: ${localPath}`);
  
  return localPath;
}
