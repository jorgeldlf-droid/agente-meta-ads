import { listarCatalogos } from './listarCatalogos.js';
import { baixarPdfLocal } from './extratorPdf.js';
import { renderizarPaginasPdf } from './renderizadorPaginas.js';
import { detectarAmbientesNaPagina, recortarAmbientes } from './recortadorAmbientes.js';
import { uploadParaStorage } from './uploaderStorage.js';
import { supabase } from './supabaseClient.js';
import path from 'path';
import fs from 'fs';

// Mapeamento de Configurações por Fornecedor
const MAPA_FORNECEDORES = {
  portinari: {
    nome: 'Portinari',
    site: 'https://www.ceramicaportinari.com.br'
  },
  ceusa: {
    nome: 'Ceusa',
    site: 'https://www.ceusa.com.br'
  },
  eliane: {
    nome: 'Eliane',
    site: 'https://www.eliane.com'
  }
};

async function iniciarImportador() {
  console.log('🚀 === INICIANDO IMPORTADOR DE CATÁLOGOS UNIVERSAL (FASE 2) ===');
  
  const args = process.argv.slice(2);
  const fornecedorArg = (args[0] || 'portinari').toLowerCase();
  
  const config = MAPA_FORNECEDORES[fornecedorArg];
  if (!config) {
    console.error(`❌ Erro: Fornecedor '${fornecedorArg}' inválido! Use 'portinari', 'ceusa' ou 'eliane'.`);
    process.exit(1);
  }
  
  const FORNECEDOR_SLUG = fornecedorArg;
  const FORNECEDOR_NOME = config.nome;
  const FORNECEDOR_SITE = config.site;
  
  const MAX_PAGINAS_TESTE = 50;
  const MAX_RECORTES_TESTE = 100;
  const MAX_RECORTES_POR_PAGINA = 3;
  
  const logsDir = path.resolve('catalogo-service/logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logExecucao = {
    horario: new Date().toISOString(),
    fornecedor: FORNECEDOR_NOME,
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

  if (!supabase) {
    const msg = '❌ Erro: Supabase Client não inicializado. Configure o arquivo "catalogo-service/.env"!';
    console.error(msg);
    logExecucao.falhas.push(msg);
    salvarLogLocal(logExecucao, logsDir, FORNECEDOR_SLUG);
    return;
  }

  try {
    const catalogos = await listarCatalogos(FORNECEDOR_SLUG);
    if (catalogos.length === 0) {
      const msg = `⚠️ Nenhum PDF de tamanho válido encontrado em ${FORNECEDOR_SLUG}/catalogos no Storage.`;
      console.log(msg);
      logExecucao.falhas.push(msg);
      salvarLogLocal(logExecucao, logsDir, FORNECEDOR_SLUG);
      return;
    }
    
    const pdfEscolhido = catalogos[0];
    logExecucao.pdf_utilizado = pdfEscolhido.name;
    console.log(`🎯 PDF Selecionado para a marca ${FORNECEDOR_NOME}: "${pdfEscolhido.name}"`);
    
    console.log(`🗄️ Verificando/Criando fornecedor ${FORNECEDOR_NOME} no banco...`);
    let fornecedorId;
    
    const { data: fornecedoresEncontrados, error: errForn } = await supabase
      .from('fornecedores')
      .select('id')
      .ilike('nome', FORNECEDOR_NOME);

    if (errForn) {
      console.error('❌ Erro ao buscar fornecedor:', errForn.message);
      logExecucao.falhas.push(`Erro ao buscar fornecedor: ${errForn.message}`);
      throw errForn;
    }

    if (fornecedoresEncontrados && fornecedoresEncontrados.length > 0) {
      fornecedorId = fornecedoresEncontrados[0].id;
      console.log(`✅ Fornecedor encontrado! ID: ${fornecedorId}`);
    } else {
      console.log(`➕ Fornecedor não encontrado. Cadastrando "${FORNECEDOR_NOME}"...`);
      const { data: novoForn, error: errCadForn } = await supabase
        .from('fornecedores')
        .insert({
          nome: FORNECEDOR_NOME,
          site_oficial: FORNECEDOR_SITE
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
          ano: 2026,
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

    const localPdfPath = await baixarPdfLocal(FORNECEDOR_SLUG, pdfEscolhido.name);
    
    const pastaSaidaSlug = nomeCatalogo.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const paginasRenderizadas = await renderizarPaginasPdf(localPdfPath, pastaSaidaSlug, MAX_PAGINAS_TESTE);

    let totalRecortesRealizados = 0;

    for (const pag of paginasRenderizadas) {
      if (pag.numero > 1) {
        console.log('⏱️ Aguardando 1 segundo para rate limit...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n📄 --- Processando Página ${pag.numero}/${paginasRenderizadas.length} ---`);
      
      const nomePaginaStorage = `${pastaSaidaSlug}_pagina_${pag.numero}.png`;

      const urlPaginaStorage = await uploadParaStorage(
        pag.caminhoLocal, 
        FORNECEDOR_SLUG, 
        'paginas', 
        nomePaginaStorage
      );

      console.log('💾 Registrando página completa no banco de dados...');
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

      const resultadoIA = await detectarAmbientesNaPagina(pag.caminhoLocal);
      
      const { confianca_geral, motivo_confianca, ambientes } = resultadoIA;
      const ehConfiavel = confianca_geral === 'alta';

      logExecucao.confianca_dos_recortes.push({
        pagina: pag.numero,
        confianca: confianca_geral,
        motivo: motivo_confianca,
        ambientes_encontrados: ambientes ? ambientes.length : 0
      });

      if (ehConfiavel && ambientes && ambientes.length > 0) {
        console.log(`✂️ Detecção confiável! Preparando recorte de ${ambientes.length} ambiente(s)...`);
        
        const recortes = await recortarAmbientes(pag.caminhoLocal, ambientes, pastaSaidaSlug);
        let recortesNestaPagina = 0;

        for (const rec of recortes) {
          if (recortesNestaPagina >= MAX_RECORTES_POR_PAGINA) {
            console.log(`⚠️ Limite de ${MAX_RECORTES_POR_PAGINA} recortes por página atingido. Pulando restantes.`);
            break;
          }

          if (totalRecortesRealizados >= MAX_RECORTES_TESTE) {
            const avisoLimit = `⚠️ Limite de ${MAX_RECORTES_TESTE} recortes atingido.`;
            console.warn(avisoLimit);
            logExecucao.falhas.push(avisoLimit);
            break;
          }

          const urlAmbienteStorage = await uploadParaStorage(
            rec.caminhoLocal,
            FORNECEDOR_SLUG,
            'ambientes',
            rec.nomeArquivo
          );

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
        if (!ehConfiavel) {
          console.log(`⚠️ Recorte automático falhou/incerto. Motivo: ${motivo_confianca}`);
          const { error: errUpdate } = await supabase
            .from('imagens_catalogo')
            .insert({
              pagina: pag.numero,
              url_imagem: urlPaginaStorage,
              tipo: 'ambiente_falhou',
              descricao: `Falha/incerteza no recorte automático por IA Vision: ${motivo_confianca}`
            });
          
          if (errUpdate) {
            console.error('❌ Erro ao registrar falha de confiança no banco:', errUpdate.message);
          }
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
    console.log(`\n✨ === IMPORTAÇÃO ${FORNECEDOR_NOME} CONCLUÍDA! ===`);

  } catch (error) {
    const errorMsg = `ERRO FATAL: ${error.message}`;
    console.error(`\n❌ ${errorMsg}`);
    logExecucao.falhas.push(errorMsg);
  } finally {
    salvarLogLocal(logExecucao, logsDir, FORNECEDOR_SLUG);
  }
}

function salvarLogLocal(logObj, logsDir, slug) {
  const timestampClean = logObj.horario.replace(/[:.]/g, '-');
  const logFilename = `execucao_${slug}_${timestampClean}.json`;
  const logPath = path.join(logsDir, logFilename);
  try {
    fs.writeFileSync(logPath, JSON.stringify(logObj, null, 2));
    console.log(`📝 Log JSON salvo em: ${logPath}`);
  } catch (err) {
    console.error('❌ Erro ao salvar log local:', err.message);
  }
}

iniciarImportador();
