import { supabase } from './supabaseClient.js';

/**
 * Lista os PDFs disponiveis no bucket 'catalogos-oficiais' sob a pasta '{fornecedor}/catalogos'
 * Adiciona protecao para ignorar PDFs maiores que 150 MB.
 * 
 * @param {string} fornecedor - Nome do fornecedor (ex: 'portinari')
 * @returns {Promise<Array>} Lista de objetos contendo os metadados dos PDFs validos
 */
export async function listarCatalogos(fornecedor = 'portinari') {
  if (!supabase) {
    throw new Error('Supabase Client nao inicializado. Verifique as credenciais no arquivo catalogo-service/.env');
  }

  const folder = `${fornecedor}/catalogos`;
  console.log(`🔍 Listando PDFs no Supabase Storage: bucket "catalogos-oficiais", pasta "${folder}"...`);
  
  const { data, error } = await supabase.storage
    .from('catalogos-oficiais')
    .list(folder, {
      limit: 50,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) {
    console.error('❌ Erro ao listar catalogos no Storage:', error.message);
    throw error;
  }

  // Filtra apenas arquivos PDF
  const pdfsOriginal = (data || []).filter(file => file.name.toLowerCase().endsWith('.pdf'));
  
  // Limite estrito de 150 MB em bytes
  const LIMITE_MB = 150;
  const MAX_SIZE_BYTES = LIMITE_MB * 1024 * 1024;
  
  const pdfsValidos = [];
  
  for (const file of pdfsOriginal) {
    // metadata.size contem o tamanho do arquivo no Supabase Storage
    const sizeBytes = file.metadata ? file.metadata.size : 0;
    const sizeMB = sizeBytes / 1024 / 1024;
    
    if (sizeBytes > MAX_SIZE_BYTES) {
      console.warn(`⚠️ [Proteção 150MB] Ignorando "${file.name}" porque excede o limite (Tamanho: ${sizeMB.toFixed(2)} MB > ${LIMITE_MB} MB).`);
      continue;
    }
    
    pdfsValidos.push(file);
  }
  
  console.log(`✨ Encontrados ${pdfsValidos.length} arquivo(s) PDF de tamanho valido (≤ ${LIMITE_MB} MB).`);
  return pdfsValidos;
}
