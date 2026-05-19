import { supabase } from './supabaseClient.js';
import fs from 'fs';
import path from 'path';

/**
 * Envia uma imagem para o bucket do Supabase Storage.
 * Protege contra a sobrescrita de arquivos existentes, buscando sua URL se ja existirem.
 * 
 * @param {string} caminhoLocal - Caminho absoluto ou relativo do arquivo local
 * @param {string} fornecedor - Nome do fornecedor (ex: 'portinari')
 * @param {string} tipo - Tipo da subpasta no bucket ('paginas' ou 'ambientes')
 * @param {string} nomeArquivo - Nome de salvamento no storage
 * @returns {Promise<string>} URL publica da imagem gerada no bucket
 */
export async function uploadParaStorage(caminhoLocal, fornecedor, tipo, nomeArquivo) {
  const remotePath = `${fornecedor}/${tipo}/${nomeArquivo}`;
  console.log(`📤 Enviando para o Storage: [catalogos-oficiais] -> "${remotePath}"...`);

  if (!fs.existsSync(caminhoLocal)) {
    throw new Error(`Arquivo local nao encontrado: ${caminhoLocal}`);
  }

  // Protecao contra sobrescrita: verifica se o arquivo ja existe no storage
  const remoteDir = `${fornecedor}/${tipo}`;
  
  try {
    const { data: filesInFolder, error: listError } = await supabase.storage
      .from('catalogos-oficiais')
      .list(remoteDir, {
        search: nomeArquivo
      });

    if (listError) {
      console.warn(`⚠️ Nao foi possivel listar para verificar a existencia de "${remotePath}": ${listError.message}`);
    }

    const arquivoExiste = filesInFolder && filesInFolder.some(f => f.name === nomeArquivo);
    if (arquivoExiste) {
      console.warn(`⚠️ [Proteção Sobrescrita] O arquivo "${remotePath}" ja existe no storage. Pulando upload.`);
      // Busca a URL publica existente sem sobrescrever
      const { data: { publicUrl } } = supabase.storage
        .from('catalogos-oficiais')
        .getPublicUrl(remotePath);
      return publicUrl;
    }
  } catch (errCheck) {
    console.warn(`⚠️ Erro ao checar existencia do arquivo: ${errCheck.message}`);
  }

  const fileBuffer = fs.readFileSync(caminhoLocal);
  
  // Identifica mime-type basico
  const ext = path.extname(nomeArquivo).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';

  // Faz o upload sem upsert por seguranca
  const { data, error } = await supabase.storage
    .from('catalogos-oficiais')
    .upload(remotePath, fileBuffer, {
      contentType,
      upsert: false
    });

  if (error) {
    console.error(`❌ Erro no upload do arquivo para o Storage:`, error.message);
    throw error;
  }

  // Busca a URL publica do arquivo enviado
  const { data: { publicUrl } } = supabase.storage
    .from('catalogos-oficiais')
    .getPublicUrl(remotePath);

  console.log(`✅ Upload concluido com sucesso. URL publica: ${publicUrl}`);
  return publicUrl;
}
