-- Sprint 3.2A — Infraestrutura comercial (sem IA, sem integração ao importador)
--
-- IMPORTANTE:
-- Antes de executar esta migration, confirme no Supabase o tipo real de:
--   - public.catalogos.id
--   - public.fornecedores.id
-- Se forem bigint/integer em vez de uuid, ajuste os tipos abaixo antes de rodar.

CREATE TABLE IF NOT EXISTS public.produtos_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  catalogo_id uuid NOT NULL REFERENCES public.catalogos(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,

  pagina_origem integer,

  linha_produto text,
  colecao text,
  nome_produto text,
  slug_produto text NOT NULL,

  formato text,
  espessura text,
  acabamento text,
  retificado text,
  variacao_tonalidade text,
  visual text,
  cor text,
  estilo text,
  uso text,
  categoria text,

  ambientes_indicados text[] NOT NULL DEFAULT '{}',
  ambientes_nao_indicados text[] NOT NULL DEFAULT '{}',
  palavras_chave text[] NOT NULL DEFAULT '{}',

  resumo_ia text,
  confianca_extracao text NOT NULL DEFAULT 'baixa',
  versao_extrator text NOT NULL DEFAULT '0.0.0',

  metadados_brutos jsonb NOT NULL DEFAULT '{}'::jsonb,
  url_imagem_referencia text,

  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT produtos_catalogo_confianca_extracao_check
    CHECK (confianca_extracao IN ('alta', 'media', 'baixa')),

  CONSTRAINT produtos_catalogo_pagina_origem_check
    CHECK (pagina_origem IS NULL OR pagina_origem > 0),

  CONSTRAINT produtos_catalogo_variacao_tonalidade_check
    CHECK (variacao_tonalidade IS NULL OR variacao_tonalidade IN ('V1', 'V2', 'V3', 'V4')),

  CONSTRAINT produtos_catalogo_slug_produto_check
    CHECK (char_length(trim(slug_produto)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_fornecedor_id
  ON public.produtos_catalogo (fornecedor_id);

CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_catalogo_id
  ON public.produtos_catalogo (catalogo_id);

CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_slug_produto
  ON public.produtos_catalogo (slug_produto);

CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_nome_produto
  ON public.produtos_catalogo (nome_produto);

CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_colecao
  ON public.produtos_catalogo (colecao);

CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_catalogo_catalogo_slug
  ON public.produtos_catalogo (catalogo_id, slug_produto);

CREATE OR REPLACE FUNCTION public.set_produtos_catalogo_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produtos_catalogo_atualizado_em ON public.produtos_catalogo;

CREATE TRIGGER trg_produtos_catalogo_atualizado_em
BEFORE UPDATE ON public.produtos_catalogo
FOR EACH ROW
EXECUTE FUNCTION public.set_produtos_catalogo_atualizado_em();

COMMENT ON TABLE public.produtos_catalogo IS
  'Produtos comerciais extraídos de catálogos PDF. Sprint 3.2A — fundação sem IA.';

COMMENT ON COLUMN public.produtos_catalogo.linha_produto IS
  'Linha comercial do fabricante (ex: Evidence, Urban, Hard).';

COMMENT ON COLUMN public.produtos_catalogo.categoria IS
  'Categoria comercial do produto (ex: Premium, Standard). Não confundir com categoria de ambiente.';

COMMENT ON COLUMN public.produtos_catalogo.variacao_tonalidade IS
  'Classificação técnica de variação de tonalidade entre peças: V1 (uniforme) a V4 (alta variação).';

COMMENT ON COLUMN public.produtos_catalogo.resumo_ia IS
  'Resumo comercial opcional. Nesta sprint permanece null; preenchimento por IA é etapa futura.';

COMMENT ON COLUMN public.produtos_catalogo.slug_produto IS
  'Identificador estável por catálogo para idempotência na reimportação.';

COMMENT ON COLUMN public.produtos_catalogo.metadados_brutos IS
  'Payload bruto da extração futura (Vision/OCR/texto). Não usar sem normalização. '
  'Poderá registrar a origem de cada campo (ex: ocr, vision, pdf_texto, heuristica, manual).';
