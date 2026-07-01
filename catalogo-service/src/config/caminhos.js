import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const CONFIG_DIR = path.dirname(__filename);

export const SERVICE_DIR = path.resolve(CONFIG_DIR, '..', '..');
export const WORKSPACE_DIR = process.env.CATALOGOS_WORKSPACE || SERVICE_DIR;

export const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'output');
export const OUTPUT_PAGINAS_DIR = path.join(OUTPUT_DIR, 'paginas');
export const OUTPUT_AMBIENTES_DIR = path.join(OUTPUT_DIR, 'ambientes');
export const LOGS_DIR = path.join(WORKSPACE_DIR, 'logs');
export const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');
export const CACHE_DIR = path.join(WORKSPACE_DIR, 'cache');

export function getPaginasCatalogoDir(nomeCatalogo) {
  return path.join(OUTPUT_PAGINAS_DIR, nomeCatalogo);
}

export function getAmbientesCatalogoDir(nomeCatalogo) {
  return path.join(OUTPUT_AMBIENTES_DIR, nomeCatalogo);
}

export function getTempPdfPath(filename) {
  return path.join(TEMP_DIR, filename);
}

export function getLogPath(filename) {
  return path.join(LOGS_DIR, filename);
}
