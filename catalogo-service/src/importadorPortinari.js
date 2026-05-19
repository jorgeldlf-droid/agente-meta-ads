import { listarCatalogos } from './listarCatalogos.js';
import { baixarPdfLocal } from './extratorPdf.js';
import { renderizarPaginasPdf } from './renderizadorPaginas.js';
import { detectarAmbientesNaPagina, recortarAmbientes } from './recortadorAmbientes.js';
import { uploadParaStorage } from './uploaderStorage.js';
import { supabase } from './supabaseClient.js';
import path from 'path';
import fs from 'fs';

async function iniciarImportador() {
  console.log('🚀 === INICIANDO IMPORTADOR DE CATÁLOGOS OFICIAIS (FASE 2) ===');
  
  const FORNECEDOR_SLUG = 'portinari';
  
  // Limites do teste semi-controlado
  const MAX_PAGINAS_TESTE = 50;
  const MAX_RECORTES_TESTE = 100;
  const MAX_RECORTES_POR_PAGINA = 3;
  
  // Inicialização do Log de Execução
  const logsDir = path.resolve('catalogo-service/logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logExecucao = {
    horario: new Date().toISOString(),
    pdf_utilizado: null,
    paginas_processadas: [],
    quantidade_de_recortes: 0,
    limites_teste: {
      max_pdf: 1,
      max_paginas: MAX_PAGINAS_TESTE,
      max_recortes: MAX_RECORTES_TESTE
    },
    falhas: [],
    confianca_dos_recortes: []
  };

  // REGRA OBRIGATÓRIA DE ROBUSTÊZ: Verifica se o cliente Supabase foi inicializado
  if (!supabase) {
    const msg = '❌ Erro: Supabase Client nao inicializado. Configure o arquivo "catalogo-service/.env" com SUPABASE_URL e SUPABASE_KEY!';
    console.error(msg);
    logExecucao.falhas.push(msg);
    salvarLogLocal(logExecucao, logsDir);
    return;
  }

  try {
    // 1. Listar os catálogos disponíveis no storage (listarCatalogos já ignora PDFs > 150 MB)
    const catalogos = await listarCatalogos(FORNECEDOR_SLUG);
    
    if (catalogos.length === 0) {
      const msg = '⚠️ Nenhum PDF de tamanho válido (≤ 150 MB) encontrado em portinari/catalogos no Storage.';
      console.log(msg);
      logExecucao.falhas.push(msg);
      salvarLogLocal(logExecucao, logsDir);
      return;
    }
    
    // Escolhe estritamente o 1º PDF para o primeiro teste (máximo 1 PDF)
    const pdfEscolhido = catalogos[0];
    logExecucao.pdf_utilizado = pdfEscolhido.name;
    console.log(`🎯 PDF Selecionado para o Primeiro Teste: "${pdfEscolhido.name}"`);
    
    // 2. Garantir ou criar fornecedor e catálogo no banco de dados conforme o Schema Real
    console.log('🗄️ Verificando/Criando fornecedor no banco de dados...');
    let fornecedorId;
    
    // Tenta buscar o fornecedor pelo nome usando ILIKE (Portinari) retornando como lista para evitar crash por duplicados
    const { data: fornecedoresEncontrados, error: errForn } = await supabase
      .from('fornecedores')
      .select('id')
      .ilike('nome', 'Portinari');

    if (errForn) {
      console.error('❌ Erro ao buscar fornecedor:', errForn.message);
      logExecucao.falhas.push(`Erro ao buscar fornecedor: ${errForn.message}`);
      throw errForn;
    }

    if (fornecedoresEncontrados && fornecedoresEncontrados.length > 0) {
      fornecedorId = fornecedoresEncontrados[0].id;
      console.log(`✅ Fornecedor encontrado! ID: ${fornecedorId}`);
    } else {
      console.log(`➕ Fornecedor não encontrado. Cadastrando "Portinari"...`);
      const { data: novoForn, error: errCadForn } = await supabase
        .from('fornecedores')
        .insert({
          nome: 'Portinari',
          site_oficial: 'https://www.ceramicaportinari.com.br'
        })
        .select('id')
        .single();

      if (errCadForn) {
        console.error('❌ Erro ao cadastrar fornecedor:', errCadForn.message);
        logExecucao.falhas.push(`Erro ao cadastrar fornecedor: ${errCadForn.message}`);
        throw errCadForn;
      }
      fornecedorId = novoForn.id;
      console.log(`✅ Fornecedor cadastrado com ID: ${fornecedorId}`);
    }

    // Tenta buscar ou cadastrar o catálogo resolvendo como lista para evitar duplicidade
    const nomeCatalogo = path.basename(pdfEscolhido.name, '.pdf');
    console.log(`🗄️ Verificando/Criando catálogo "${nomeCatalogo}" no banco de dados...`);
    let catalogoId;

    const { data: catalogosEncontrados, error: errCat } = await supabase
      .from('catalogos')
      .select('id')
      .eq('nome', nomeCatalogo)
      .eq('fornecedor_id', fornecedorId);

    if (errCat) {
      console.error('❌ Erro ao buscar catálogo:', errCat.message);
      logExecucao.falhas.push(`Erro ao buscar catálogo: ${errCat.message}`);
      throw errCat;
    }

    if (catalogosEncontrados && catalogosEncontrados.length > 0) {
      catalogoId = catalogosEncontrados[0].id;
      console.log(`✅ Catálogo encontrado! ID: ${catalogoId}`);
    } else {
      console.log(`➕ Cadastrando catálogo no banco de dados...`);
      const { data: novoCat, error: errCadCat } = await supabase
        .from('catalogos')
        .insert({
          fornecedor_id: fornecedorId,
          nome: nomeCatalogo,
          ano: 2025,
          arquivo_pdf: pdfEscolhido.name,
          fonte: 'Catálogo oficial em PDF'
        })
        .select('id')
        .single();

      if (errCadCat) {
        console.error('❌ Erro ao cadastrar catálogo:', errCadCat.message);
        logExecucao.falhas.push(`Erro ao cadastrar catálogo: ${errCadCat.message}`);
        throw errCadCat;
      }
      catalogoId = novoCat.id;
      console.log(`✅ Catálogo cadastrado com ID: ${catalogoId}`);
    }

    // 3. Baixar o PDF localmente
    const localPdfPath = await baixarPdfLocal(FORNECEDOR_SLUG, pdfEscolhido.name);
    
    // 4. Renderizar as primeiras páginas (limitadas estritamente a MAX_PAGINAS_TESTE = 3)
    const pastaSaidaSlug = nomeCatalogo.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const paginasRenderizadas = await renderizarPaginasPdf(localPdfPath, pastaSaidaSlug, MAX_PAGINAS_TESTE);

    let totalRecortesRealizados = 0;

    // 5. Iterar sobre as páginas para realizar upload e detecção
    for (const pag of paginasRenderizadas) {
      // Atraso de 1 segundo entre as páginas (Rate Limit)
      if (pag.numero > 1) {
        console.log('⏱️ Aguardando 1 segundo para rate limit...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n📄 --- Processando Página ${pag.numero}/${paginasRenderizadas.length} ---`);
      
      const nomePaginaStorage = `${pastaSaidaSlug}_pagina_${pag.numero}.png`;

      // REGRA OBRIGATÓRIA: Sempre salvar imagem original no storage ANTES de qualquer tentativa de recorte
      const urlPaginaStorage = await uploadParaStorage(
        pag.caminhoLocal, 
        FORNECEDOR_SLUG, 
        'paginas', 
        nomePaginaStorage
      );

      // Registra a página completa no banco de dados conforme o Schema Real
      console.log('💾 Registrando página completa no banco de dados (registro principal/fallback)...');
      const { data: imgPaginaDb, error: errInsPagina } = await supabase
        .from('imagens_catalogo')
        .insert({
          pagina: pag.numero,
          url_imagem: urlPaginaStorage,
          tipo: 'pagina',
          descricao: `Página ${pag.numero} do catálogo ${nomeCatalogo}`
        })
        .select('id')
        .single();

      let paginaStatus = 'sucesso';
      if (errInsPagina) {
        console.error(`❌ Erro ao registrar página ${pag.numero} no banco:`, errInsPagina.message);
        logExecucao.falhas.push(`Erro ao registrar página ${pag.numero} no banco: ${errInsPagina.message}`);
        paginaStatus = 'falha_banco';
      } else {
        console.log(`✅ Página registrada no banco com sucesso (ID: ${imgPaginaDb.id})`);
      }

      // Agora inicia a análise por IA Vision para tentar obter coordenadas
      const resultadoIA = await detectarAmbientesNaPagina(pag.caminhoLocal);
      
      const { confianca_geral, motivo_confianca, ambientes } = resultadoIA;
      const ehConfiavel = confianca_geral === 'alta';

      // Registra detalhes de confiança no log JSON
      logExecucao.confianca_dos_recortes.push({
        pagina: pag.numero,
        confianca: confianca_geral,
        motivo: motivo_confianca,
        ambientes_encontrados: ambientes ? ambientes.length : 0
      });

      // Se a confiança for alta e existirem ambientes detectados, procedemos ao recorte
      if (ehConfiavel && ambientes && ambientes.length > 0) {
        console.log(`✂️ Detecção confiável! Preparando recorte de ${ambientes.length} ambiente(s)...`);
        
        const recortes = await recortarAmbientes(pag.caminhoLocal, ambientes, pastaSaidaSlug);
        let recortesNestaPagina = 0;

        for (const rec of recortes) {
          // REGRA OBRIGATÓRIA: Limitar recortes por página
          if (recortesNestaPagina >= MAX_RECORTES_POR_PAGINA) {
            console.log(`⚠️ Limite de ${MAX_RECORTES_POR_PAGINA} recortes por página atingido. Pulando restantes.`);
            break;
          }

          // REGRA OBRIGATÓRIA: Limitar estritamente a 100 recortes no total
          if (totalRecortesRealizados >= MAX_RECORTES_TESTE) {
            const avisoLimit = `⚠️ [Limite Teste] Limite máximo de ${MAX_RECORTES_TESTE} recortes atingido. Pulando novos recortes.`;
            console.warn(avisoLimit);
            logExecucao.falhas.push(avisoLimit);
            break;
          }

          // Upload do ambiente recortado para o Storage
          const urlAmbienteStorage = await uploadParaStorage(
            rec.caminhoLocal,
            FORNECEDOR_SLUG,
            'ambientes',
            rec.nomeArquivo
          );

          // Registra o recorte de ambiente no banco de dados conforme o Schema Real
          console.log(`💾 Registrando ambiente recortado ("${rec.descricao}") no banco...`);
          const { error: errInsAmbiente } = await supabase
            .from('imagens_catalogo')
            .insert({
              pagina: pag.numero,
              url_imagem: urlAmbienteStorage,
              tipo: 'ambiente',
              descricao: rec.descricao || `Ambiente recortado da página ${pag.numero}`
            });

          if (errInsAmbiente) {
            console.error(`❌ Erro ao registrar ambiente no banco:`, errInsAmbiente.message);
            logExecucao.falhas.push(`Erro ao registrar ambiente da página ${pag.numero} no banco: ${errInsAmbiente.message}`);
          } else {
            console.log(`✅ Ambiente recortado registrado com sucesso!`);
            totalRecortesRealizados++;
            recortesNestaPagina++;
          }
        }

        logExecucao.paginas_processadas.push({
          numero: pag.numero,
          url_pagina_original: urlPaginaStorage,
          confianca_recorte: 'alta',
          ambientes_detectados: recortesNestaPagina,
          status: paginaStatus
        });

      } else {
        // Se o recorte automático falhar ou ficar incerto (Confiança Baixa)
        if (!ehConfiavel) {
          console.log(`⚠️ Recorte automático ficou incerto ou falhou (Confiança Baixa). Motivo: ${motivo_confianca}`);
          
          // REGRA OBRIGATÓRIA: Registrar baixa confiança no banco e usar página inteira
          const { error: errUpdate } = await supabase
            .from('imagens_catalogo')
            .insert({
              pagina: pag.numero,
              url_imagem: urlPaginaStorage,
              tipo: 'ambiente_falhou',
              descricao: `Falha ou incerteza no recorte automático por IA Vision: ${motivo_confianca}`
            });
          
          if (errUpdate) {
            console.error('❌ Erro ao registrar falha de confiança no banco:', errUpdate.message);
            logExecucao.falhas.push(`Erro ao persistir log de baixa confiança no banco: ${errUpdate.message}`);
          } else {
            console.log('✅ Registro de baixa confiança de corte persistido no banco para auditoria.');
          }
        } else {
          console.log('ℹ️ Página processada com sucesso. Nenhum ambiente decorado foi detectado.');
        }

        logExecucao.paginas_processadas.push({
          numero: pag.numero,
          url_pagina_original: urlPaginaStorage,
          confianca_recorte: ehConfiavel ? 'alta (sem ambientes)' : 'baixa',
          ambientes_detectados: 0,
          status: paginaStatus
        });
      }
    }

    logExecucao.quantidade_de_recortes = totalRecortesRealizados;

    console.log('\n💾 Finalizando catálogo no banco de dados...');
    console.log('\n✨ === PROCESSO DE TESTE CONCLUÍDO COM SUCESSO! ===');

  } catch (error) {
    const errorMsg = `OCORREU UM ERRO FATAL DURANTE A EXECUÇÃO: ${error.message}`;
    console.error(`\n❌ ${errorMsg}`);
    logExecucao.falhas.push(errorMsg);
  } finally {
    // Garante que o arquivo de log JSON seja salvo ao término de qualquer execução
    salvarLogLocal(logExecucao, logsDir);
  }
}

/**
 * Salva o log da execução atual em formato JSON na pasta logs
 */
function salvarLogLocal(logObj, logsDir) {
  const timestampClean = logObj.horario.replace(/[:.]/g, '-');
  const logFilename = `execucao_${timestampClean}.json`;
  const logPath = path.join(logsDir, logFilename);
  
  try {
    fs.writeFileSync(logPath, JSON.stringify(logObj, null, 2));
    console.log(`📝 Log JSON da execução salvo com sucesso em: ${logPath}`);
  } catch (err) {
    console.error('❌ Não foi possível escrever o arquivo de log local:', err.message);
  }
}

iniciarImportador();
