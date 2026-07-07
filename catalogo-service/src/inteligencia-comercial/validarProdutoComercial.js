import {
  montarProdutoComercialPadronizado,
  normalizarVariacaoTonalidade,
  VARIACOES_TONALIDADE_PERMITIDAS,
} from './normalizarProdutoComercial.js';

function temTexto(valor) {
  return Boolean(String(valor || '').trim());
}

function temIdentificadorTecnico(produto = {}) {
  return [produto.formato, produto.acabamento, produto.visual].some((campo) => {
    const texto = String(campo || '').trim();
    return texto && texto !== 'Outros';
  });
}

/**
 * Valida produto comercial padronizado ou entrada bruta.
 * Não lança erro — retorna resultado estruturado.
 *
 * @param {object} entrada
 * @param {{ exigirRelacionamentos?: boolean }} opcoes
 * @returns {{ valido: boolean, erros: string[], produto: object }}
 */
export function validarProdutoComercial(entrada = {}, opcoes = {}) {
  const erros = [];
  const exigirRelacionamentos = opcoes.exigirRelacionamentos === true;

  const produto = montarProdutoComercialPadronizado(entrada);

  const temIdentidade =
    temTexto(produto.nome_produto) ||
    temTexto(produto.colecao) ||
    temTexto(produto.linha_produto);

  if (!temIdentidade) {
    erros.push('Informe nome_produto, colecao ou linha_produto.');
  }

  if (!temIdentificadorTecnico(produto)) {
    erros.push(
      'Informe pelo menos um identificador técnico entre formato, acabamento ou visual (diferente de "Outros").'
    );
  }

  const variacaoInformada = entrada.variacao_tonalidade ?? entrada.variacaoTonalidade;
  if (variacaoInformada !== undefined && variacaoInformada !== null && String(variacaoInformada).trim() !== '') {
    const variacaoNormalizada = normalizarVariacaoTonalidade(variacaoInformada);
    if (!VARIACOES_TONALIDADE_PERMITIDAS.includes(variacaoNormalizada)) {
      erros.push('variacao_tonalidade deve ser V1, V2, V3 ou V4.');
    }
  }

  if (!temTexto(produto.slug_produto)) {
    erros.push('slug_produto não pôde ser gerado.');
  }

  if (exigirRelacionamentos) {
    if (!produto.catalogo_id) {
      erros.push('catalogo_id é obrigatório para persistência.');
    }
    if (!produto.fornecedor_id) {
      erros.push('fornecedor_id é obrigatório para persistência.');
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    produto,
  };
}
