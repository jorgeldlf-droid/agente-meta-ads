import { supabase } from './supabaseClient.js';
import fs from 'fs';
import path from 'path';

/**
 * Faz o download de um PDF do Supabase Storage para processamento local
 * @param {string} fornecedor - Nome do fornecedor (ex: 'portinari')
 * @param {string} filename - Nome do arquivo PDF no storage
 * @returns {Promise<string>} Caminho local do PDF baixado
 */
export async function baixarPdfLocal(fornecedor, filename) {
  const remotePath = `${fornecedor}/catalogos/${filename}`;
  const localDir = path.resolve('catalogo-service/output/temp');
  
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  
  const localPath = path.join(localDir, filename);
  console.log(`📥 Baixando arquivo do Supabase Storage: "${remotePath}" para "${localPath}"...`);

  const { data, error } = await supabase.storage
    .from('catalogos-oficiais')
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
