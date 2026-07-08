import { supabase } from '../supabaseClient.js';
import { validarProdutoComercial } from './validarProdutoComercial.js';

function criarResumoPersistencia() {
  return {
    persistidos: 0,
    ignorados: 0,
    erros: [],
    tempo_ms: 0,
  };
}

/**
 * Verifica se a tabela produtos_catalogo existe e está acessível.
 */
export async function verificarTabelaProdutosCatalogoDisponivel() {
  if (!supabase) {
    throw new Error(
      'Cliente Supabase não configurado. Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const { error } = await supabase
    .from('produtos_catalogo')
    .select('id', { count: 'exact', head: true });

  if (!error) return true;

  const tabelaInexistente =
    error.code === '42P01'
    || error.code === 'PGRST205'
    || /relation.*does not exist/i.test(error.message || '');

  if (tabelaInexistente) {
    throw new Error(
      'Tabela produtos_catalogo não existe. Execute a migration 20260707140000_create_produtos_catalogo.sql antes de usar --persistir.'
    );
  }

  throw new Error(`Erro ao verificar tabela produtos_catalogo: ${error.message}`);
}

/**
 * Resolve catalogo_id e fornecedor_id por slug.
 * Catálogo: prioriza arquivo_pdf; fallback por nome.
 * Não cria registros automaticamente.
 */
async function buscarCatalogoPorArquivoPdf(fornecedorId, arquivoPdf) {
  const arquivo = String(arquivoPdf || '').trim();
  if (!arquivo) return null;

  const { data, error } = await supabase
    .from('catalogos')
    .select('id,nome,arquivo_pdf,fornecedor_id')
    .eq('fornecedor_id', fornecedorId)
    .eq('arquivo_pdf', arquivo);

  if (error) {
    throw new Error(`Erro ao buscar catálogo por arquivo_pdf: ${error.message}`);
  }

  if (!data?.length) return null;

  if (data.length > 1) {
    const ids = data.map((c) => c.id).join(', ');
    throw new Error(
      `Múltiplos catálogos encontrados para arquivo_pdf "${arquivo}" ` +
      `(fornecedor_id=${fornecedorId}): ids [${ids}]. Corrija a duplicidade no banco.`
    );
  }

  return data[0];
}

async function buscarCatalogoPorNome(fornecedorId, nomeCatalogo) {
  const nome = String(nomeCatalogo || '').trim();
  if (!nome) return null;

  const { data, error } = await supabase
    .from('catalogos')
    .select('id,nome,arquivo_pdf,fornecedor_id')
    .eq('fornecedor_id', fornecedorId)
    .eq('nome', nome);

  if (error) {
    throw new Error(`Erro ao buscar catálogo por nome: ${error.message}`);
  }

  if (!data?.length) return null;

  if (data.length > 1) {
    const ids = data.map((c) => c.id).join(', ');
    throw new Error(
      `Múltiplos catálogos encontrados para nome "${nome}" ` +
      `(fornecedor_id=${fornecedorId}): ids [${ids}]. Corrija a duplicidade no banco.`
    );
  }

  return data[0];
}

export async function resolverRelacionamentosComerciais({
  fornecedorSlug,
  nomeCatalogo,
  arquivoPdf,
} = {}) {
  await verificarTabelaProdutosCatalogoDisponivel();

  const slug = String(fornecedorSlug || '').trim().toLowerCase();
  const nomeCat = String(nomeCatalogo || '').trim();
  const arquivo = String(arquivoPdf || '').trim();

  if (!slug) {
    throw new Error('fornecedorSlug é obrigatório para persistência.');
  }
  if (!arquivo && !nomeCat) {
    throw new Error('arquivoPdf ou nomeCatalogo é obrigatório para persistência.');
  }

  const { data: fornecedor, error: errForn } = await supabase
    .from('fornecedores')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (errForn) {
    throw new Error(`Erro ao buscar fornecedor: ${errForn.message}`);
  }

  if (!fornecedor) {
    throw new Error(`Fornecedor não encontrado no banco para slug: ${slug}`);
  }

  let catalogo = await buscarCatalogoPorArquivoPdf(fornecedor.id, arquivo);
  let metodoResolucao = 'arquivo_pdf';

  if (!catalogo) {
    catalogo = await buscarCatalogoPorNome(fornecedor.id, nomeCat);
    metodoResolucao = 'nome';
  }

  if (!catalogo) {
    throw new Error(
      `Catálogo não encontrado para fornecedor slug "${slug}". ` +
      `Tentativas: arquivo_pdf="${arquivo || '(vazio)'}", nome="${nomeCat || '(vazio)'}". ` +
      'Cadastre o catálogo via importador antes de usar --persistir.'
    );
  }

  return {
    catalogo,
    fornecedor,
    catalogo_id: catalogo.id,
    fornecedor_id: fornecedor.id,
    metodo_resolucao_catalogo: metodoResolucao,
  };
}

function montarRegistroPersistencia(produto = {}) {
  return {
    catalogo_id: produto.catalogo_id,
    fornecedor_id: produto.fornecedor_id,
    pagina_origem: produto.pagina_origem,
    linha_produto: produto.linha_produto,
    colecao: produto.colecao,
    nome_produto: produto.nome_produto,
    slug_produto: produto.slug_produto,
    formato: produto.formato,
    espessura: produto.espessura,
    acabamento: produto.acabamento,
    retificado: produto.retificado,
    variacao_tonalidade: produto.variacao_tonalidade,
    visual: produto.visual,
    cor: produto.cor,
    estilo: produto.estilo,
    uso: produto.uso,
    categoria: produto.categoria,
    ambientes_indicados: produto.ambientes_indicados || [],
    ambientes_nao_indicados: produto.ambientes_nao_indicados || [],
    palavras_chave: produto.palavras_chave || [],
    resumo_ia: produto.resumo_ia,
    confianca_extracao: produto.confianca_extracao || 'baixa',
    versao_extrator: produto.versao_extrator,
    metadados_brutos: produto.metadados_brutos || {},
    url_imagem_referencia: produto.url_imagem_referencia,
  };
}

/**
 * Persiste produtos válidos da auditoria em produtos_catalogo.
 * Idempotente por (catalogo_id, slug_produto) via upsert em lote.
 */
export async function persistirProdutosCatalogo({
  catalogoId,
  fornecedorId,
  produtos = [],
} = {}) {
  const inicioMs = Date.now();
  const resumo = criarResumoPersistencia();

  await verificarTabelaProdutosCatalogoDisponivel();

  if (!catalogoId || !fornecedorId) {
    throw new Error('catalogoId e fornecedorId são obrigatórios para persistência.');
  }

  const registros = [];

  for (const item of produtos) {
    if (!item?.validacao?.valido) {
      resumo.ignorados += 1;
      resumo.erros.push({
        pagina: item?.pagina ?? null,
        motivo: 'Produto inválido — não persistido.',
        erros: item?.validacao?.erros || [],
      });
      continue;
    }

    const produtoComRelacionamentos = {
      ...item.produto_normalizado,
      catalogo_id: catalogoId,
      fornecedor_id: fornecedorId,
      metadados_brutos:
        item.produto_extraido?.metadados_brutos
        ?? item.produto_normalizado?.metadados_brutos
        ?? {},
    };

    const validacao = validarProdutoComercial(produtoComRelacionamentos, {
      exigirRelacionamentos: true,
    });

    if (!validacao.valido) {
      resumo.ignorados += 1;
      resumo.erros.push({
        pagina: item.pagina,
        slug_produto: validacao.produto.slug_produto,
        motivo: 'Validação falhou antes da persistência.',
        erros: validacao.erros,
      });
      continue;
    }

    registros.push(montarRegistroPersistencia(validacao.produto));
  }

  if (registros.length > 0) {
    const { error } = await supabase
      .from('produtos_catalogo')
      .upsert(registros, { onConflict: 'catalogo_id,slug_produto' });

    if (error) {
      resumo.erros.push({
        motivo: 'Falha no upsert em lote.',
        registros_afetados: registros.length,
        erros: [error.message],
      });
    } else {
      resumo.persistidos = registros.length;
    }
  }

  resumo.tempo_ms = Date.now() - inicioMs;
  return resumo;
}
