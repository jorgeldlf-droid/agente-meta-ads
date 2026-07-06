import path from 'path';

// Caracteres permitidos pelo validador do Supabase Storage (S3-safe / \w + conjunto fixo).
const CARACTERE_PERMITIDO = /^[\w !.\-*'()&$@=;:+,?]$/;

/**
 * Sanitiza um segmento de chave do Supabase Storage.
 * Remove acentos (NFD) e substitui caracteres invalidos por "_".
 */
export function sanitizarSegmentoChaveStorage(segmento = '') {
  const semAcentos = String(segmento)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const sanitizado = semAcentos
    .split('')
    .map((char) => (CARACTERE_PERMITIDO.test(char) ? char : '_'))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .trim();

  return sanitizado;
}

/**
 * Sanitiza nome de arquivo para object key no Storage. Preserva extensao.
 */
export function sanitizarNomeArquivoStorage(nomeArquivo = '') {
  const ext = path.extname(nomeArquivo).toLowerCase();
  const base = path.basename(nomeArquivo, path.extname(nomeArquivo));
  const baseSanitizada = sanitizarSegmentoChaveStorage(base);

  if (!baseSanitizada) {
    return `arquivo${ext || '.pdf'}`;
  }

  return `${baseSanitizada}${ext}`;
}

/**
 * Indica se o nome precisa ser sanitizado antes do upload.
 */
export function nomeArquivoPrecisaSanitizacao(nomeArquivo = '') {
  return sanitizarNomeArquivoStorage(nomeArquivo) !== nomeArquivo;
}
