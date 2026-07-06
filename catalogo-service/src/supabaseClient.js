import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carrega .env local ao catalogo-service
dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });
// Fallback para caso o script seja executado diretamente de dentro do diretorio catalogo-service/
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.warn('ATENCAO: SUPABASE_URL e uma chave Supabase (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_KEY) devem estar configuradas em catalogo-service/.env');
}

// Cria o cliente apenas se as chaves existirem para evitar crashes imediatos em importações e testes de ambiente
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;
