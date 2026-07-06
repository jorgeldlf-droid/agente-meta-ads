import { spawn } from 'child_process';
import { SERVICE_DIR } from './config/caminhos.js';

let importacaoEmAndamento = false;

function executarImportadorPdf(fornecedorSlug, nomeArquivo) {
  return new Promise((resolve, reject) => {
    const args = [
      'src/importadorUniversal.js',
      '--fornecedor',
      fornecedorSlug,
      '--pdf',
      nomeArquivo,
    ];

    const child = spawn(process.execPath, args, {
      cwd: SERVICE_DIR,
      stdio: 'inherit',
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Processo encerrou com código ${code}`));
    });
  });
}

function imprimirResumoFinal(resumo) {
  console.log(`
========================================
IMPORTAÇÃO PÓS-SYNC FINALIZADA
========================================
Total recebido:
${resumo.totalRecebido}

Importados com sucesso:
${resumo.sucesso}

Falhas:
${resumo.falhas}

Ignorados (importação já em andamento):
${resumo.ignorados}
========================================
`);
}

/**
 * Executa o importadorUniversal em subprocesso para cada PDF sincronizado.
 *
 * @param {Array<{ fornecedorSlug: string, nomeArquivo: string, acao: string }>} pdfsParaImportar
 */
export async function importarPdfsSincronizados(pdfsParaImportar = []) {
  if (!pdfsParaImportar.length) {
    console.log('[Importação Pós-Sync] Nenhum PDF novo ou alterado para importar.');
    return;
  }

  if (importacaoEmAndamento) {
    console.warn(
      `[Importação Pós-Sync] Importação já em andamento. ` +
      `${pdfsParaImportar.length} PDF(s) ignorados nesta rodada.`
    );
    imprimirResumoFinal({
      totalRecebido: pdfsParaImportar.length,
      sucesso: 0,
      falhas: 0,
      ignorados: pdfsParaImportar.length,
    });
    return;
  }

  importacaoEmAndamento = true;

  const resumo = {
    totalRecebido: pdfsParaImportar.length,
    sucesso: 0,
    falhas: 0,
    ignorados: 0,
  };

  const novos = pdfsParaImportar.filter((item) => item.acao === 'novo');
  const atualizados = pdfsParaImportar.filter((item) => item.acao === 'atualizado');

  console.log('[Importação Pós-Sync] Início da importação automática.');
  console.log(`[Importação Pós-Sync] Diretório de execução: ${SERVICE_DIR}`);
  console.log(`[Importação Pós-Sync] Novos: ${novos.length} | Atualizados: ${atualizados.length}`);

  try {
    for (const pdf of pdfsParaImportar) {
      console.log('');
      console.log(`[Importação Pós-Sync] (${pdf.acao}) ${pdf.fornecedorSlug}/${pdf.nomeArquivo}`);

      try {
        await executarImportadorPdf(pdf.fornecedorSlug, pdf.nomeArquivo);
        resumo.sucesso += 1;
        console.log(`[Importação Pós-Sync] Concluído: ${pdf.fornecedorSlug}/${pdf.nomeArquivo}`);
      } catch (error) {
        resumo.falhas += 1;
        console.error(
          `[Importação Pós-Sync] Falha em ${pdf.fornecedorSlug}/${pdf.nomeArquivo}:`,
          error.message
        );
      }
    }
  } finally {
    importacaoEmAndamento = false;
    imprimirResumoFinal(resumo);
  }
}
