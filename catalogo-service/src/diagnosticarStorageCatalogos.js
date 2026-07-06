import { supabase } from './supabaseClient.js';
import { BUCKET_CATALOGOS, obterCandidatosPasta } from './storagePastas.js';

const BUCKET = BUCKET_CATALOGOS;
const fornecedor = (process.argv[2] || 'ceusa').trim().toLowerCase();

if (!supabase) {
  console.error('Supabase Client nao inicializado. Verifique as credenciais existentes sem alterar o .env.');
  process.exit(1);
}

async function listarPasta(path = '') {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(path, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) {
    console.error(`Erro ao listar "${path || '/'}": ${error.message}`);
    return [];
  }

  console.log(`\n[BUCKET ${BUCKET}] ${path || '/'}`);
  if (!data || data.length === 0) {
    console.log('  vazio');
    return [];
  }

  for (const item of data) {
    const tipo = item.id ? 'arquivo' : 'pasta';
    const size = item.metadata?.size ? ` - ${item.metadata.size} bytes` : '';
    console.log(`  ${tipo}: ${item.name}${size}`);
  }

  return data;
}

async function listarRecursivo(path = '', profundidade = 0, maxProfundidade = 2) {
  if (profundidade > maxProfundidade) return;

  const itens = await listarPasta(path);
  for (const item of itens) {
    const parecePasta = !item.id;
    if (!parecePasta) continue;

    const proximoPath = path ? `${path}/${item.name}` : item.name;
    await listarRecursivo(proximoPath, profundidade + 1, maxProfundidade);
  }
}

console.log(`Diagnostico somente leitura do bucket "${BUCKET}"`);
console.log(`Fornecedor analisado: ${fornecedor}`);

await listarPasta('');
await listarPasta(fornecedor);

for (const pasta of obterCandidatosPasta('catalogos')) {
  await listarPasta(`${fornecedor}/${pasta}`);
}

console.log('\nBusca recursiva rasa para localizar PDFs:');
await listarRecursivo(fornecedor, 0, 2);
