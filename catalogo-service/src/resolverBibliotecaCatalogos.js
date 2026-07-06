import fs from 'fs';
import path from 'path';

const NOME_BIBLIOTECA = 'catalogos-porcelanato';
const NOME_PASTA_GITHUB = 'Github';
const SUBPASTA_PDFS = 'PDFs';
const PROFUNDIDADE_MAXIMA_BUSCA = 6;

function bibliotecaPossuiPdfs(caminhoBiblioteca) {
  if (!fs.existsSync(caminhoBiblioteca)) return false;

  let stat;
  try {
    stat = fs.statSync(caminhoBiblioteca);
  } catch {
    return false;
  }

  if (!stat.isDirectory()) return false;

  const entradas = fs.readdirSync(caminhoBiblioteca, { withFileTypes: true });

  for (const entrada of entradas) {
    if (!entrada.isDirectory()) continue;

    const pastaPdfs = path.join(caminhoBiblioteca, entrada.name, SUBPASTA_PDFS);
    if (!fs.existsSync(pastaPdfs)) continue;

    let arquivos;
    try {
      arquivos = fs.readdirSync(pastaPdfs);
    } catch {
      continue;
    }

    if (arquivos.some((nome) => nome.toLowerCase().endsWith('.pdf'))) {
      return true;
    }
  }

  return false;
}

function encontrarBibliotecaEmGithub(pastaGithub) {
  const candidato = path.join(pastaGithub, NOME_BIBLIOTECA);
  return bibliotecaPossuiPdfs(candidato) ? candidato : null;
}

/**
 * Busca recursivamente (com limite de profundidade) uma pasta "Github"
 * que contenha catalogos-porcelanato validado.
 */
function buscarBibliotecaViaGithub(raizOneDrive) {
  if (!raizOneDrive || !fs.existsSync(raizOneDrive)) return null;

  const fila = [{ dir: raizOneDrive, profundidade: 0 }];

  while (fila.length > 0) {
    const { dir, profundidade } = fila.shift();

    if (profundidade > PROFUNDIDADE_MAXIMA_BUSCA) continue;

    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entrada of entradas) {
      if (!entrada.isDirectory()) continue;

      const caminhoFilho = path.join(dir, entrada.name);

      if (entrada.name.toLowerCase() === NOME_PASTA_GITHUB.toLowerCase()) {
        const biblioteca = encontrarBibliotecaEmGithub(caminhoFilho);
        if (biblioteca) return biblioteca;
      }

      if (profundidade < PROFUNDIDADE_MAXIMA_BUSCA) {
        fila.push({ dir: caminhoFilho, profundidade: profundidade + 1 });
      }
    }
  }

  return null;
}

function obterCandidatosBiblioteca() {
  const candidatos = [];

  for (const envVar of ['OneDrive', 'OneDriveConsumer']) {
    const raizOneDrive = process.env[envVar];
    if (raizOneDrive) {
      const viaGithub = buscarBibliotecaViaGithub(raizOneDrive);
      if (viaGithub) {
        candidatos.push(viaGithub);
      }
    }
  }

  candidatos.push(path.resolve(process.cwd(), '..', NOME_BIBLIOTECA));

  return [...new Set(candidatos)];
}

/**
 * Resolve o caminho da biblioteca oficial de catálogos no OneDrive.
 * @returns {string|null} Caminho absoluto validado ou null se não encontrado.
 */
export function resolverBibliotecaCatalogos() {
  for (const candidato of obterCandidatosBiblioteca()) {
    if (bibliotecaPossuiPdfs(candidato)) {
      return candidato;
    }
  }

  return null;
}
