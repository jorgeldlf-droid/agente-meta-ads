import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { sincronizarCatalogosStorage } from "./catalogo-service/src/sincronizarCatalogosStorage.js";
import { importarPdfsSincronizados } from "./catalogo-service/src/importarPdfsSincronizados.js";
import { REGISTRO_FORNECEDORES } from "./catalogo-service/src/registroFornecedores.js";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'catalogo-service/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || "https://odxqvkfmmndvsjvzzijm.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FORNECEDORES = Object.fromEntries(
  REGISTRO_FORNECEDORES.map(({ nome, slug, site, dominios }) => [
    nome,
    {
      slug,
      links: [site.endsWith("/") ? site : `${site}/`],
      dominios,
    },
  ])
);

const fornecedores = Object.keys(FORNECEDORES);
const fornecedoresGerarPosts = [...fornecedores];
const fornecedorGeralPosts = "Geral";

const linksFornecedores = Object.fromEntries(
  fornecedores.map((nome) => [nome, FORNECEDORES[nome].links])
);
const dominiosOficiais = Object.fromEntries(
  fornecedores.map((nome) => [nome, FORNECEDORES[nome].dominios])
);

function obterConfigFornecedor(fornecedor = "") {
  if (!fornecedor) return null;
  if (FORNECEDORES[fornecedor]) {
    return { nome: fornecedor, ...FORNECEDORES[fornecedor] };
  }
  const match = fornecedores.find(
    (nome) => nome.toLowerCase() === String(fornecedor).toLowerCase()
  );
  return match ? { nome: match, ...FORNECEDORES[match] } : null;
}

function obterSlugStorageFornecedor(fornecedor = "") {
  return obterConfigFornecedor(fornecedor)?.slug ?? null;
}

function urlImagemPertenceAoFornecedor(url = "", fornecedor = "") {
  const slug = obterSlugStorageFornecedor(fornecedor);
  if (!slug || !url) return false;
  return String(url).toLowerCase().includes(`/${slug.toLowerCase()}/`);
}

function limparJson(texto) {
  return String(texto || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function detectarFornecedor(texto = "", listaFornecedores = fornecedores) {
  const lower = String(texto).toLowerCase();

  return (
    listaFornecedores.find((fornecedor) =>
      lower.includes(fornecedor.toLowerCase())
    ) || null
  );
}

function obterFornecedorBusca(fornecedorStr, listaFornecedores = fornecedores) {
  if (!fornecedorStr) return null;
  const partes = fornecedorStr.split(',').map(s => s.trim());
  for (const parte of partes) {
    const match = listaFornecedores.find(f => f.toLowerCase() === parte.toLowerCase());
    if (match) {
      return match;
    }
  }
  return null;
}

function obterPeriodoMesVigente(base = new Date()) {
  const inicioMes = new Date(base.getFullYear(), base.getMonth(), 1);
  const inicioProximoMes = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { inicioMes, inicioProximoMes };
}

function dataEstaNoMesVigente(data, periodo = obterPeriodoMesVigente()) {
  const dataObj = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(dataObj.getTime())) return false;
  return dataObj >= periodo.inicioMes && dataObj < periodo.inicioProximoMes;
}

function detectarCampanhaPromocao(posts = []) {
  const textoCampanha = posts
    .map((post) => post.legenda || "")
    .join(" ")
    .toLowerCase();

  if (
    textoCampanha.includes("convocação dos porcelanatos") ||
    textoCampanha.includes("convocacao dos porcelanatos")
  ) {
    return "Convocação dos Porcelanatos";
  }

  if (
    textoCampanha.includes("exterminador do prejuízo") ||
    textoCampanha.includes("exterminador do prejuizo")
  ) {
    return "Exterminador do Prejuízo";
  }

  return "Campanha vigente do mês atual";
}

function detectarFornecedoresTexto(texto = "", listaFornecedores = fornecedores) {
  const lower = String(texto || "").toLowerCase();
  return listaFornecedores
    .filter((fornecedor) => lower.includes(fornecedor.toLowerCase()))
    .sort((a, b) => b.length - a.length);
}

function normalizarFornecedorGerarPosts(post = {}) {
  const textoCompleto = [
    post.fornecedor,
    post.tema,
    post.gancho,
    post.legenda,
    post.promptImagem
  ].filter(Boolean).join(" ");

  const fornecedoresPermitidosCitados = detectarFornecedoresTexto(textoCompleto, fornecedoresGerarPosts);
  const fornecedoresNaoPermitidosCitados = detectarFornecedoresTexto(textoCompleto, fornecedores)
    .filter((fornecedor) => !fornecedoresGerarPosts.includes(fornecedor));

  const categoria = String(post.categoriaEstrategica || "").toLowerCase();
  const pareceEducativo =
    categoria.includes("duvida") ||
    categoria.includes("dúvida") ||
    categoria.includes("educ") ||
    categoria.includes("curios") ||
    categoria.includes("utilidade") ||
    Boolean(post.perguntaConsumidor);

  if (pareceEducativo && fornecedoresPermitidosCitados.length === 0) {
    return {
      fornecedor: fornecedorGeralPosts,
      tipoPost: "educativo",
      fornecedoresPermitidosCitados,
      fornecedoresNaoPermitidosCitados,
      avisoFornecedor: null
    };
  }

  const fornecedorUnico =
    obterFornecedorBusca(post.fornecedor, fornecedoresGerarPosts) ||
    fornecedoresPermitidosCitados[0] ||
    fornecedorGeralPosts;

  const tipoPost = fornecedorUnico === fornecedorGeralPosts ? "educativo" : "produto";
  const misturaMarcas =
    fornecedoresPermitidosCitados.filter((f) => f !== fornecedorUnico).length > 0 ||
    fornecedoresNaoPermitidosCitados.length > 0 ||
    String(post.fornecedor || "").includes(",");

  return {
    fornecedor: fornecedorUnico,
    tipoPost,
    fornecedoresPermitidosCitados,
    fornecedoresNaoPermitidosCitados,
    avisoFornecedor: misturaMarcas && tipoPost === "produto"
      ? `Post ajustado para usar somente o fornecedor ${fornecedorUnico}.`
      : null
  };
}

function removerMarcasConflitantes(texto = "", fornecedorEscolhido) {
  if (!texto) return "";
  let limpo = String(texto);
  const marcasParaRemover = fornecedores
    .filter((marca) => marca.toLowerCase() !== String(fornecedorEscolhido).toLowerCase())
    .sort((a, b) => b.length - a.length);

  for (const marca of marcasParaRemover) {
    const regex = new RegExp(`\\b${marca.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi");
    limpo = limpo.replace(regex, fornecedorEscolhido === fornecedorGeralPosts ? "" : fornecedorEscolhido);
  }

  return limpo
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function obterFornecedorDaImagemBanco(url = "") {
  const lower = String(url || "").toLowerCase();
  const fornecedoresOrdenados = [...fornecedoresGerarPosts].sort((a, b) => {
    const slugA = obterSlugStorageFornecedor(a) || "";
    const slugB = obterSlugStorageFornecedor(b) || "";
    return slugB.length - slugA.length;
  });
  return fornecedoresOrdenados.find((fornecedor) => {
    const slug = obterSlugStorageFornecedor(fornecedor);
    return slug && lower.includes(`/${slug}/`);
  }) || null;
}

function ambienteCombinaTema(ambiente, textoBusca = "", eTemaExterno = false) {
  const descricao = String(ambiente?.descricao || "").toLowerCase();
  const texto = String(textoBusca || "").toLowerCase();
  const url = String(ambiente?.url_imagem || "").toLowerCase();

  if (!ambiente?.url_imagem) return false;

  if (eTemaExterno) {
    return ["area externa", "área externa", "piscina", "fachada", "varanda", "garagem", "externo", "externa", "quintal", "antiderrapante"]
      .some((termo) => descricao.includes(termo) || url.includes(termo));
  }

  if (!texto || !descricao) return true;
  return descricao.split(/\s+/).some((palavra) => palavra.length > 4 && texto.includes(palavra));
}

function escolherAmbienteMesmoFornecedor(ambientesDb = [], fornecedor, textoBusca = "", eTemaExterno = false, urlEvitar = null) {
  const ambientesFornecedor = ambientesDb.filter((amb) =>
    amb.url_imagem &&
    obterFornecedorDaImagemBanco(amb.url_imagem) === fornecedor &&
    amb.url_imagem !== urlEvitar
  );

  const compativeis = ambientesFornecedor.filter((amb) => ambienteCombinaTema(amb, textoBusca, eTemaExterno));
  const candidatos = compativeis.length > 0 ? compativeis : ambientesFornecedor;
  if (candidatos.length === 0) return null;
  return candidatos[Math.floor(Math.random() * candidatos.length)];
}

function extrairTokensProduto(textos = []) {
  return String(textos.filter(Boolean).join(" "))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function temTokenProduto(tokens = [], token) {
  return tokens.includes(String(token || "").toUpperCase());
}

function interpretarUsoProdutoBanco(fornecedor = "", descricao = "", url = "") {
  const tokens = extrairTokensProduto([descricao, url]);
  const fornecedorNorm = String(fornecedor || "").toLowerCase();

  if (["portinari", "ceusa"].includes(fornecedorNorm)) {
    if (temTokenProduto(tokens, "HARD")) return "porcelanato antiderrapante / externo";
    if (temTokenProduto(tokens, "NAT")) return "porcelanato natural / interno";
    if (temTokenProduto(tokens, "POL")) return "porcelanato polido / brilho / interno";
    if (temTokenProduto(tokens, "ACT")) return "porcelanato acetinado / interno";
  }

  if (fornecedorNorm === "eliane") {
    if (temTokenProduto(tokens, "EXT")) return "porcelanato antiderrapante / externo";
    if (temTokenProduto(tokens, "PO") || temTokenProduto(tokens, "POL")) return "porcelanato polido / brilho / interno";
    if (temTokenProduto(tokens, "NA")) return "porcelanato natural / interno";
    if (temTokenProduto(tokens, "AC")) return "porcelanato acetinado / interno";
  }

  return "uso/acabamento não identificado pela nomenclatura";
}

function selecionarAmbienteOficialUnico(ambientesDb = [], fornecedor, imagensSugeridas = new Set()) {
  const ambientesFornecedor = ambientesDb.filter((amb) =>
    amb.url_imagem &&
    obterFornecedorDaImagemBanco(amb.url_imagem) === fornecedor
  );

  const disponiveis = ambientesFornecedor.filter((amb) => !imagensSugeridas.has(amb.url_imagem));
  const candidatos = disponiveis.length > 0 ? disponiveis : ambientesFornecedor;
  if (candidatos.length === 0) return null;

  const escolhido = candidatos[Math.floor(Math.random() * candidatos.length)];
  imagensSugeridas.add(escolhido.url_imagem);

  return {
    ...escolhido,
    fornecedor,
    usoInterpretado: interpretarUsoProdutoBanco(fornecedor, escolhido.descricao, escolhido.url_imagem),
  };
}

function escolherAmbienteAlternativoNaoUsado(ambientesDb = [], fornecedor, imagensUsadas = new Set(), urlAtual = null) {
  const ambientesFornecedor = ambientesDb.filter((amb) =>
    amb.url_imagem &&
    obterFornecedorDaImagemBanco(amb.url_imagem) === fornecedor
  );

  const alternativos = ambientesFornecedor.filter((amb) =>
    amb.url_imagem !== urlAtual &&
    !imagensUsadas.has(amb.url_imagem)
  );

  if (alternativos.length === 0) return null;

  const escolhido = alternativos[Math.floor(Math.random() * alternativos.length)];
  return {
    ...escolhido,
    fornecedor,
    usoInterpretado: interpretarUsoProdutoBanco(fornecedor, escolhido.descricao, escolhido.url_imagem),
  };
}

function montarContextoAmbientesPrioritarios(ambientes = []) {
  if (ambientes.length === 0) return "";

  return [
    "=== AMBIENTES OFICIAIS PRIORITÁRIOS PARA POSTS DE FORNECEDOR ===",
    "Para posts de fornecedor específico, comece por estes produtos/imagens reais da loja. Não repita URL.",
    ...ambientes.map((amb, index) =>
      `${index + 1}. Fornecedor: ${amb.fornecedor} | Produto real: "${amb.descricao}" | Uso/acabamento interpretado: ${amb.usoInterpretado} | Página: ${amb.pagina} | URL da Imagem Oficial: ${amb.url_imagem}`
    )
  ].join("\n");
}

function normalizarTextoComparacao(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function precisaCorrigirComparativoPolidoAcetinado(tema = "", gancho = "", legenda = "") {
  const contexto = normalizarTextoComparacao(`${tema} ${gancho}`);
  const textoLegenda = normalizarTextoComparacao(legenda);

  const temaComparaPolidoAcetinado =
    contexto.includes("polido") &&
    contexto.includes("acetinado");

  if (!temaComparaPolidoAcetinado) return false;

  return !(
    textoLegenda.includes("porcelanato polido") &&
    textoLegenda.includes("porcelanato acetinado")
  );
}

function corrigirLegendaComparativoPolidoAcetinado(legenda = "") {
  let texto = String(legenda || "").trim();

  texto = texto
    .replace(/\bporcelanato\s+e\s+porcelanato\b/gi, "porcelanato polido e porcelanato acetinado")
    .replace(/\bpolido\s+e\s+acetinado\b/gi, "porcelanato polido e porcelanato acetinado")
    .replace(/\bo polido\b/gi, "o porcelanato polido")
    .replace(/\bo acetinado\b/gi, "o porcelanato acetinado")
    .replace(/\bjá o\b/gi, "já o porcelanato acetinado");

  const textoNormalizado = normalizarTextoComparacao(texto);
  if (
    textoNormalizado.includes("porcelanato polido") &&
    textoNormalizado.includes("porcelanato acetinado")
  ) {
    return texto;
  }

  return `${texto} Em resumo: o porcelanato polido possui brilho mais intenso e aparência sofisticada, enquanto o porcelanato acetinado possui acabamento mais fosco, toque suave e costuma ser uma escolha prática para áreas internas.`;
}

function criarPromptImagemEducativo(post = {}) {
  return [
    post.tema,
    post.gancho,
    post.perguntaConsumidor,
    "imagem realista para Instagram sobre porcelanatos, ceramicas e revestimentos",
    "sem logo, sem texto, ambiente moderno, foco no assunto do post"
  ].filter(Boolean).join(". ");
}


function validarDominioOficial(url, fornecedor) {
  try {
    if (!url || !fornecedor) return false;

    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();

    const dominios = dominiosOficiais[fornecedor] || [];

    return dominios.some((dominio) => host.includes(dominio));
  } catch {
    return false;
  }
}

function normalizarUrlImagem(imagem, baseUrl) {
  if (!imagem) return null;

  try {
    if (imagem.startsWith("http")) return imagem;

    const base = new URL(baseUrl);

    if (imagem.startsWith("//")) {
      return `${base.protocol}${imagem}`;
    }

    if (imagem.startsWith("/")) {
      return `${base.origin}${imagem}`;
    }

    return `${base.origin}/${imagem}`;
  } catch {
    return null;
  }
}

function extrairImagemDoHtml(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<img[^>]+src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return normalizarUrlImagem(match[1], baseUrl);
    }
  }

  return null;
}

// Validar se URL tem extensão de imagem válida para evitar quebra no frontend
function isFormatoImagemValido(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('.jpg') || 
         lowerUrl.includes('.jpeg') || 
         lowerUrl.includes('.png') || 
         lowerUrl.includes('.webp');
}

// Cache simples em memória para evitar chamadas repetidas à API do Serper.dev
const imageCache = new Map();

async function buscarImagemOficial(fornecedor, tema = "") {
  const apiKey = process.env.SERPER_API_KEY;
  // Fallback seguro: se não tiver chave, retorna null
  if (!apiKey) return null;

  const dominios = dominiosOficiais[fornecedor] || [];
  if (dominios.length === 0) return null;

  const cacheKey = `${fornecedor}-${tema}`.toLowerCase();
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  const querySite = dominios.map(d => `site:${d}`).join(" OR ");
  
  // Múltiplas buscas em cascata
  const queries = [
    `${querySite} ${fornecedor} ${tema}`.trim(),
    `${querySite} ${fornecedor} porcelanato`,
    `${querySite} ${fornecedor} revestimento`,
    `${querySite} ${fornecedor} coleção`,
    `${querySite} ${fornecedor} ambiente`
  ];

  for (const query of queries) {
    try {
      const response = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ q: query, num: 5 })
      });

      if (!response.ok) continue;

      const data = await response.json();
      const images = data.images || [];

      const dominiosBloqueados = [
        "unsplash", "pexels", "pixabay", "pinterest", 
        "mercadolivre", "shopee", "freepik", "shutterstock",
        "adobe", "magazineluiza", "leroymerlin", "madeiramadeira",
        "instagram", "facebook", "tiktok", "youtube"
      ];

      for (const img of images) {
        if (!img.imageUrl) continue;
        
        const origemLink = img.link || img.sourceUrl || "";
        const lowerImageUrl = img.imageUrl.toLowerCase();
        const lowerOrigem = origemLink.toLowerCase();
        
        // 1. Barreira Anti-Genérica/Marketplace/Rede Social
        const isBloqueada = dominiosBloqueados.some(d => lowerImageUrl.includes(d) || lowerOrigem.includes(d));
        if (isBloqueada) continue;

        // 2. Validação Dupla (Página de Origem OU CDN da Imagem)
        const dominioImagemValido = validarDominioOficial(img.imageUrl, fornecedor);
        const dominioLinkValido = origemLink ? validarDominioOficial(origemLink, fornecedor) : false;
            
        if ((dominioImagemValido || dominioLinkValido) && isFormatoImagemValido(img.imageUrl)) {
          
          const passouPor = dominioImagemValido ? "Dominio da Imagem" : "Dominio da Página Origem";
          console.log(`[Serper] 🟢 Encontrou OFICIAL!`);
          console.log(`   - Fornecedor: ${fornecedor}`);
          console.log(`   - Passou por: ${passouPor}`);
          console.log(`   - URL Imagem: ${img.imageUrl}`);
          console.log(`   - URL Origem: ${origemLink}`);
          
          imageCache.set(cacheKey, img.imageUrl);
          return img.imageUrl;
        }
      }
      console.log(`[Serper] 🔴 Não encontrou | Fornecedor: ${fornecedor} | Query: "${query}"`);
    } catch (error) {
      console.log(`[Serper] ❌ Erro | Fornecedor: ${fornecedor} | Query: "${query}" | Erro:`, error.message);
    }
  }

  console.log(`[Serper] 🚫 Nenhuma imagem encontrada para ${fornecedor} no tema "${tema}". Cache negativo salvo.`);
  imageCache.set(cacheKey, null); // Evita repetir a cascata para a mesma combinação que já sabemos que falha
  return null;
}

function criarPromptSistema() {
  return `
Você é um especialista em marketing para loja de porcelanatos.

Loja: Porcelanato Shop.

Prioridades:
- Sempre favorecer porcelanato.
- Foco em venda na loja física.
- Foco em WhatsApp.
- Linguagem clara, comercial e moderna.
- Conteúdo para Instagram.
- Tom profissional, mas com apelo de venda.

Fornecedores da loja:
${fornecedores.join(", ")}
`;
}

async function gerarTextoIA(prompt, maxTokens = 1200) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: criarPromptSistema(),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.8,
    max_tokens: maxTokens,
  });

  return completion.choices[0].message.content;
}

app.get("/", (req, res) => {
  res.json({
    status: "Servidor IA Porcelanato Shop funcionando",
    porta: PORT,
  });
});

app.post("/promocao-vigente", async (req, res) => {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    let rawPosts = [];

    // Tentar buscar da API se configurado
    if (token) {
      try {
        rawPosts = await buscarMidiasInstagramAtualizadas(token, 50);
        if (rawPosts.length === 0) {
          console.warn("[Promocao Vigente] Nenhuma mídia real retornada pela Meta API.");
        }
      } catch (err) {
        console.warn("[Promocao Vigente] Erro ao consumir API Meta, usando Mock Premium.", err);
      }
    }

    // Filtrar posts do mês vigente
    let postsCampanha = [];
    if (rawPosts.length > 0) {
      const periodoMes = obterPeriodoMesVigente();
      postsCampanha = rawPosts.filter(p => dataEstaNoMesVigente(p.timestamp, periodoMes));
      
      // Filtrar posts com palavras chaves da campanha se houver
      const keywords = ["prejuízo", "desconto", "porcelanato", "obra", "reforma", "black", "oferta", "promocao", "promoção", "dr", "exterminador", "ceusa", "portinari", "eliane"];
      const filtrados = postsCampanha.filter(p => 
        keywords.some(kw => (p.legenda || "").toLowerCase().includes(kw))
      );
      if (filtrados.length > 0) {
        postsCampanha = filtrados;
      }
    }

    // Mock Premium para a campanha vigente "Exterminador do Prejuízo" com imagens reais do banco e marcação de métricas estimadas
    if (postsCampanha.length === 0) {
      postsCampanha = [
        {
          id: "mock_post_1",
          tipo: "VIDEO",
          imagem: "https://odxqvkfmmndvsjvzzijm.supabase.co/storage/v1/object/public/catalogos-oficiais/ceusa/ambientes/pagina_pagina_16_ambiente_1.png",
          legenda: "🚨 EXTERMINADOR DO PREJUÍZO ATIVO! 🚨 Venha garantir porcelanatos Ceusa com descontos Black Friday de verdade na Porcelanato Shop! O maior desconto do ano para acabar de vez com o prejuízo da sua obra!",
          likes: 412,
          comments: 45,
          shares: 89,
          saves: 64,
          reach: 8420,
          interacoes: 610,
          engajamento: 7.24,
          score: (412 * 1) + (45 * 4) + (89 * 5) + (64 * 6), // 1421
          estimado: true,
          permalink: "https://www.instagram.com"
        },
        {
          id: "mock_post_2",
          tipo: "CAROUSEL_ALBUM",
          imagem: "https://odxqvkfmmndvsjvzzijm.supabase.co/storage/v1/object/public/catalogos-oficiais/portinari/ambientes/pagina_pagina_19_ambiente_1.png",
          legenda: "Você sabe a diferença entre Porcelanato Polido e Acetinado? 🤔 Fizemos esse carrossel educativo completo para ajudar você a decidir a melhor opção para a sua sala ou área gourmet. Confira os detalhes de Portinari!",
          likes: 310,
          comments: 28,
          shares: 45,
          saves: 112,
          reach: 6200,
          interacoes: 495,
          engajamento: 7.98,
          score: (310 * 1) + (28 * 4) + (45 * 5) + (112 * 6), // 1319
          estimado: true,
          permalink: "https://www.instagram.com"
        },
        {
          id: "mock_post_3",
          tipo: "VIDEO",
          imagem: "https://odxqvkfmmndvsjvzzijm.supabase.co/storage/v1/object/public/catalogos-oficiais/ceusa/ambientes/pagina_pagina_34_ambiente_1.png",
          legenda: "Porcelanato escorrega? 😳 Saiba como escolher o modelo antiderrapante ideal para garantir a máxima segurança da sua garagem, piscina ou varanda. Veja esse ambiente incrível com piso Ceusa!",
          likes: 480,
          comments: 32,
          shares: 72,
          saves: 80,
          reach: 9500,
          interacoes: 664,
          engajamento: 6.99,
          score: (480 * 1) + (32 * 4) + (72 * 5) + (80 * 6), // 1448
          estimado: true,
          permalink: "https://www.instagram.com"
        },
        {
          id: "mock_post_4",
          tipo: "IMAGE",
          imagem: "https://odxqvkfmmndvsjvzzijm.supabase.co/storage/v1/object/public/catalogos-oficiais/portinari/ambientes/pagina_pagina_3_ambiente_1.png",
          legenda: "Detalhe minimalista de porcelanato em banheiro de serviço. Preço promocional imperdível esta semana para porcelanatos Portinari.",
          likes: 22,
          comments: 1,
          shares: 2,
          saves: 4,
          reach: 1100,
          interacoes: 29,
          engajamento: 2.64,
          score: (22 * 1) + (1 * 4) + (2 * 5) + (4 * 6), // 60
          estimado: true,
          permalink: "https://www.instagram.com"
        }
      ];
    }

    const nomeCampanhaVigente = detectarCampanhaPromocao(postsCampanha);

    // 2. Classificação automatizada por telemetria de métricas e score ponderado
    const postsOrdenadosPorInteracoes = [...postsCampanha].sort((a, b) => b.interacoes - a.interacoes);
    const postsOrdenadosPorAlcance = [...postsCampanha].sort((a, b) => b.reach - a.reach);
    const postsOrdenadosPorEngajamento = [...postsCampanha].sort((a, b) => b.engajamento - a.engajamento);
    const postsOrdenadosPorSaves = [...postsCampanha].sort((a, b) => b.saves - a.saves);
    const postsOrdenadosPorScore = [...postsCampanha].sort((a, b) => b.score - a.score);

    postsCampanha.forEach(post => { post.analiseFlag = null; });

    // Atribuição de Badges
    const videoPrincipal = postsCampanha.find(p => p.tipo === "VIDEO" && p.id === postsOrdenadosPorAlcance.find(x => x.tipo === "VIDEO")?.id);
    if (videoPrincipal) videoPrincipal.analiseFlag = "video_principal";

    const topCarousel = postsCampanha.find(p => p.tipo === "CAROUSEL_ALBUM" && p.id === postsOrdenadosPorInteracoes.find(x => x.tipo === "CAROUSEL_ALBUM")?.id);
    if (topCarousel && !topCarousel.analiseFlag) topCarousel.analiseFlag = "top_carousel";

    const topReel = postsCampanha.find(p => p.tipo === "VIDEO" && p.id === postsOrdenadosPorInteracoes.find(x => x.tipo === "VIDEO" && x.id !== videoPrincipal?.id)?.id);
    if (topReel && !topReel.analiseFlag) topReel.analiseFlag = "top_reel";

    const maxAlcance = postsCampanha.find(p => p.id === postsOrdenadosPorAlcance[0]?.id);
    if (maxAlcance && !maxAlcance.analiseFlag) maxAlcance.analiseFlag = "maior_alcance";

    const maxEngaj = postsCampanha.find(p => p.id === postsOrdenadosPorEngajamento[0]?.id);
    if (maxEngaj && !maxEngaj.analiseFlag) maxEngaj.analiseFlag = "maior_engajamento";

    const maxSaves = postsCampanha.find(p => p.id === postsOrdenadosPorSaves[0]?.id);
    if (maxSaves && !maxSaves.analiseFlag) maxSaves.analiseFlag = "maior_retencao";

    const minDesempenho = postsCampanha.find(p => p.id === postsOrdenadosPorScore[postsOrdenadosPorScore.length - 1]?.id);
    if (minDesempenho && !minDesempenho.analiseFlag) minDesempenho.analiseFlag = "pior_desempenho";

    // Marcar recomendação de impulsionamento no post com o maior score
    postsCampanha.forEach(post => { post.recomendacaoImpulsionamento = false; });
    const topScorePost = postsCampanha.find(p => p.id === postsOrdenadosPorScore[0]?.id);
    if (topScorePost) {
      topScorePost.recomendacaoImpulsionamento = true;
    }

    // 3. Chamada unificada estruturada à OpenAI
    const postsSimples = postsCampanha.map(p => ({
      id: p.id,
      tipo: p.tipo,
      legenda: p.legenda.slice(0, 150) + "...",
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      reach: p.reach,
      engajamento: p.engajamento,
      score: p.score,
      analiseFlag: p.analiseFlag
    }));

    const promptIa = `
Você é o Mestre Técnico de Marketing da Porcelanato Shop, um analista de tráfego pago e marketing de mídias sociais de elite.
Sua tarefa é analisar o desempenho dos posts da campanha de porcelanato vigente do mês ("${nomeCampanhaVigente}").

Aqui está a lista de posts reais analisados do Instagram (com as métricas de engajamento, alcance e score real ponderado):
${JSON.stringify(postsSimples, null, 2)}

REGRAS DE PESO DE MÉTRICAS QUE VOCÊ DEVE AVALIAR CRITICAMENTE:
1. Reels/Vídeos normalmente performam diferente de carrosséis (Carrosséis têm excelente engajamento orgânico contínuo; Reels têm alto alcance inicial).
2. Salvamentos têm peso maior para conteúdo educativo (indica alta relevância/retenção de valor).
3. Compartilhamentos têm peso maior para viralização.
4. Comentários têm peso maior para intenção comercial direta.
5. O Score Real Ponderado foi calculado como: score = (likes * 1) + (comments * 4) + (shares * 5) + (saves * 6).

Por favor, gere uma resposta estritamente no formato JSON válido (sem tags markdown de bloco \`\`\`json nas laterais, apenas o texto bruto JSON) contendo exatamente estas duas chaves:
1. "analiseMarkdown": Uma análise estratégica de marketing de alto nível em formato Markdown. Ela DEVE ser rica, detalhada e cobrir de forma incisiva e acionável:
   - **Campanha Vigente**: Análise de como o tema da campanha ("${nomeCampanhaVigente}") está sendo recebido pela audiência.
   - **Qual post impulsionar**: Escolha clara de qual post impulsionar, com:
     * O objetivo ideal da campanha (Alcance, Tráfego WhatsApp, Engajamento ou Reconhecimento).
     * O orçamento sugerido.
     * O motivo técnico detalhado com base nas regras de pesos citadas.
   - **Qual post repetir/replicar**: Qual padrão criativo ou tema deu certo e deve ganhar nova versão.
   - **Qual post pausar/ajustar**: Qual desempenho foi insatisfatório e por quê.
   - **Melhor Gancho & Formato**: Análise de qual gancho (escorregamento, polido vs acetinado, preço baixo) engajou melhor e qual formato (Reels, Carrossel) obteve maior conversão.
   - **Padrões de Sucesso & Saturação**: Que elementos estéticos e visuais funcionaram e que tipo de conteúdo cansou o cliente.
2. "observacoesPosts": Um objeto onde as chaves são os IDs dos posts e os valores são observações curtas da IA (de 1 a 2 frases) explicando o motivo do seu desempenho e a recomendação imediata para aquele post específico.

Lembre-se de retornar APENAS o JSON válido para que possamos parsear diretamente via JSON.parse().
`;

    const textoIA = await gerarTextoIA(promptIa, 1800);
    let analiseJson = { analiseMarkdown: "", observacoesPosts: {} };

    try {
      analiseJson = JSON.parse(limparJson(textoIA));
    } catch (e) {
      console.error("[Promocao Vigente] Falha ao parsear JSON retornado da IA:", e);
      analiseJson = {
        analiseMarkdown: textoIA || `### Análise da Campanha: ${nomeCampanhaVigente}\n\nA promoção está gerando engajamento saudável com base nos posts reais da campanha vigente. Recomenda-se priorizar os conteúdos com maior score ponderado, salvamentos, compartilhamentos e intenção comercial para decisões de tráfego.`,
        observacoesPosts: {}
      };
    }

    postsCampanha.forEach(post => {
      post.observacaoIA = analiseJson.observacoesPosts[post.id] || "Desempenho saudável. Ótimo criativo para atração de leads.";
    });

    res.json({
      success: true,
      analise: analiseJson.analiseMarkdown,
      resumo: {
        campanhaVigente: nomeCampanhaVigente
      },
      promocaoVigente: postsCampanha
    });
  } catch (error) {
    console.error("Erro /promocao-vigente:", error);
    res.status(500).json({ erro: "Erro ao gerar promoção vigente" });
  }
});

const LIMITE_HISTORICO_INSTAGRAM = 5000;

async function topConteudosHandler(req, res) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
      return res.status(400).json({ erro: "META_ACCESS_TOKEN não configurado no .env" });
    }

    const historicoCompleto = String(
      req.query?.historico || req.body?.historico || ""
    ).toLowerCase() === "all";

    const limiteMidias = obterLimiteMeta(req, 25, 50);
    const postsTratados = historicoCompleto
      ? await buscarHistoricoCompletoInstagram(token, LIMITE_HISTORICO_INSTAGRAM)
      : await buscarMidiasInstagramAtualizadas(token, limiteMidias);

    const topConteudos = [...postsTratados].sort((a, b) => b.interacoes - a.interacoes);

    res.json({
      success: true,
      topConteudos,
      historico: historicoCompleto,
      totalCarregado: topConteudos.length,
      limiteSegurancaAtingido: historicoCompleto && topConteudos.length >= LIMITE_HISTORICO_INSTAGRAM,
    });
  } catch (error) {
    console.error("Erro /top-conteudos:", error);
    res.status(500).json({ erro: "Erro ao buscar conteúdos reais na Meta API" });
  }
}

app.get("/top-conteudos", topConteudosHandler);
app.post("/top-conteudos", topConteudosHandler);

// NOVA ROTA: Analisar conteúdo real (Engenharia Reversa)
app.post("/analisar-conteudo-top", async (req, res) => {
  try {
    const { post } = req.body;
    if (!post) {
      return res.status(400).json({ erro: "Dados do post não fornecidos." });
    }

    const legendaSegura = typeof post.legenda === "string" ? post.legenda.slice(0, 300) : "Sem legenda";

    const prompt = `
Faça a engenharia reversa do sucesso deste conteúdo real do Instagram da loja de porcelanatos.

DADOS DO CONTEÚDO:
- Tipo: ${post.tipo}
- Legenda original: ${legendaSegura}
- Interações totais: ${post.interacoes}
- Engajamento: ${post.engajamento}%

Retorne uma análise direta, no seguinte formato Markdown:
- **Por que performou:** [sua análise]
- **Padrão a repetir:** [o que manter]
- **Próximo post sugerido:** [ideia]
- **CTA Melhorado:** [sugestão de chamada para Whatsapp/Loja]
- **Ideia de Reel Derivado:** [roteiro curtinho]
- **Foco Comercial:** [como isso vende porcelanato]
`;

    const analise = await gerarTextoIA(prompt, 1200);
    res.json({ analise });
  } catch (error) {
    console.error("Erro /analisar-conteudo-top:", error);
    res.status(500).json({ erro: "Erro ao analisar conteúdo top" });
  }
});

const fetchWithTimeout = async (url, options = {}, timeout = 12000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

function extrairInsightInstagram(midia, nomes) {
  const insights = midia?.insights?.data;
  if (!Array.isArray(insights)) return null;

  const encontrado = insights.find((item) => nomes.includes(item?.name));
  const valor = encontrado?.values?.[0]?.value ?? encontrado?.value;
  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : null;
}

function calcularMetricasReaisInstagram(midia) {
  const isReel =
    midia.media_product_type === "REELS" ||
    (!midia.media_product_type && midia.media_type === "VIDEO");
  const totalLikesReel = isReel ? extrairInsightInstagram(midia, ["total_likes"]) : null;
  const totalCommentsReel = isReel ? extrairInsightInstagram(midia, ["total_comments"]) : null;
  const viewsReel = isReel ? extrairInsightInstagram(midia, ["total_views", "views"]) : null;
  const repostsReel = isReel ? extrairInsightInstagram(midia, ["reposts"]) : null;

  const likes = Number(totalLikesReel ?? midia.like_count ?? 0);
  const comments = Number(totalCommentsReel ?? midia.comments_count ?? 0);
  const reach = extrairInsightInstagram(midia, ["reach"]);
  const shares = extrairInsightInstagram(midia, ["shares"]);
  const saves = extrairInsightInstagram(midia, ["saved", "saves"]);
  const insightsIncompletos = reach === null || shares === null || saves === null;
  const metricasOrigem = totalLikesReel !== null || totalCommentsReel !== null
    ? "reels_total"
    : "media_public_fields";

  const reachSeguro = reach ?? 0;
  const sharesSeguro = shares ?? 0;
  const savesSeguro = saves ?? 0;
  const viewsSeguro = viewsReel ?? 0;
  const repostsSeguro = repostsReel ?? 0;
  const interacoes = likes + comments + sharesSeguro + savesSeguro;
  const engajamento = reachSeguro > 0
    ? Number(((interacoes / reachSeguro) * 100).toFixed(2))
    : 0;
  const score = likes + comments * 4 + sharesSeguro * 5 + savesSeguro * 6;

  return {
    likes,
    comments,
    shares: sharesSeguro,
    saves: savesSeguro,
    reach: reachSeguro,
    views: viewsSeguro,
    reposts: repostsSeguro,
    interacoes,
    engajamento,
    score,
    estimado: false,
    metricasDesatualizadas: insightsIncompletos,
    metricasOrigem
  };
}

function obterLimiteMeta(req, padrao = 25, maximo = 50) {
  const valor = Number(req.body?.limit || req.query?.limit || padrao);
  return Math.min(Math.max(valor, 1), maximo);
}

function montarMidiaInstagram(midiaBase, midiaComInsights = null) {
  const origemMetricas = midiaComInsights
    ? { ...midiaBase, insights: midiaComInsights.insights }
    : midiaBase;
  const metricas = calcularMetricasReaisInstagram(origemMetricas);

  let imagemSegura = null;
  if (midiaBase.media_type === "VIDEO") {
    imagemSegura = midiaBase.thumbnail_url || midiaBase.media_url || null;
  } else {
    imagemSegura = midiaBase.media_url || midiaBase.thumbnail_url || null;
  }

  return {
    id: midiaBase.id,
    tipo: midiaBase.media_type || "IMAGE",
    imagem: imagemSegura,
    legenda: typeof midiaBase.caption === "string" ? midiaBase.caption : "Sem legenda",
    permalink: typeof midiaBase.permalink === "string" && midiaBase.permalink.startsWith("http") ? midiaBase.permalink : null,
    timestamp: midiaBase.timestamp || new Date().toISOString(),
    data: midiaBase.timestamp ? new Date(midiaBase.timestamp).toLocaleDateString("pt-BR") : "-",
    ...metricas
  };
}

async function buscarInstagramBusinessId(token) {
  if (process.env.INSTAGRAM_BUSINESS_ID) {
    return process.env.INSTAGRAM_BUSINESS_ID;
  }

  const pageRes = await fetchWithTimeout(`https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account&access_token=${token}`, {}, 10000);
  const pageData = await pageRes.json();
  return pageData.data?.find(p => p.instagram_business_account)?.instagram_business_account?.id || null;
}

async function buscarPaginasInstagram(urlInicial, limiteSeguranca) {
  const midias = [];
  const urlsVisitadas = new Set();
  let proximaUrl = urlInicial;

  while (
    proximaUrl &&
    midias.length < limiteSeguranca &&
    !urlsVisitadas.has(proximaUrl)
  ) {
    urlsVisitadas.add(proximaUrl);

    const resposta = await fetchWithTimeout(proximaUrl, {}, 12000);
    const dados = await resposta.json();

    if (dados.error) {
      throw new Error(dados.error.message || "Erro ao paginar mídias do Instagram");
    }

    const pagina = Array.isArray(dados.data) ? dados.data : [];
    const restante = limiteSeguranca - midias.length;
    midias.push(...pagina.slice(0, restante));

    proximaUrl = dados.paging?.next || null;
  }

  return midias;
}

async function buscarHistoricoCompletoInstagram(token, limiteSeguranca = LIMITE_HISTORICO_INSTAGRAM) {
  const igAccount = await buscarInstagramBusinessId(token);
  if (!igAccount) return [];

  const baseFields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const insightFields = `${baseFields},insights.metric(reach,shares,saved,total_likes,total_comments,total_views,views,reposts)`;

  const urlBase =
    `https://graph.facebook.com/v18.0/${igAccount}/media` +
    `?fields=${baseFields}&limit=50&access_token=${token}`;

  const midiasBase = await buscarPaginasInstagram(urlBase, limiteSeguranca);
  if (midiasBase.length === 0) return [];

  let insightsPorId = new Map();

  try {
    const urlInsights =
      `https://graph.facebook.com/v18.0/${igAccount}/media` +
      `?fields=${insightFields}&limit=50&access_token=${token}`;

    const midiasComInsights = await buscarPaginasInstagram(urlInsights, limiteSeguranca);
    insightsPorId = new Map(midiasComInsights.map((midia) => [midia.id, midia]));
  } catch (error) {
    console.warn(
      "[Meta API] Falha ao buscar insights do histórico. Mantendo mídia-base.",
      error.message
    );
  }

  return midiasBase.map((midia) =>
    montarMidiaInstagram(midia, insightsPorId.get(midia.id))
  );
}

async function buscarMidiasInstagramAtualizadas(token, limit = 25) {
  const igAccount = await buscarInstagramBusinessId(token);
  if (!igAccount) return [];

  const baseFields = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const baseRes = await fetchWithTimeout(`https://graph.facebook.com/v18.0/${igAccount}/media?fields=${baseFields}&limit=${limit}&access_token=${token}`, {}, 12000);
  const baseData = await baseRes.json();

  if (!Array.isArray(baseData.data) || baseData.data.length === 0) {
    return [];
  }

  let insightsPorId = new Map();
  try {
    const insightFields = `${baseFields},insights.metric(reach,shares,saved,total_likes,total_comments,total_views,views,reposts)`;
    const insightsRes = await fetchWithTimeout(`https://graph.facebook.com/v18.0/${igAccount}/media?fields=${insightFields}&limit=${limit}&access_token=${token}`, {}, 12000);
    const insightsData = await insightsRes.json();
    if (Array.isArray(insightsData.data)) {
      insightsPorId = new Map(insightsData.data.map((m) => [m.id, m]));
    }
  } catch (err) {
    console.warn("[Meta API] Falha ao buscar insights orgânicos. Mantendo likes/comments reais.", err.message);
  }

  return baseData.data.map((m) => montarMidiaInstagram(m, insightsPorId.get(m.id)));
}

app.post("/instagram-insights", async (req, res) => {
  console.log("[Insights] Nova requisição POST /instagram-insights iniciada.");
  try {
    const token = process.env.META_ACCESS_TOKEN;
    let rawPosts = [];
    const apenasMetricas = req.body?.apenasMetricas === true;
    const limiteMidias = obterLimiteMeta(req, 25, 50);

    // 1. Tentar obter dados reais via Meta API
    if (token) {
      try {
        console.log("[Meta API] Token de acesso Meta presente. Buscando Instagram Business ID...");
        rawPosts = await buscarMidiasInstagramAtualizadas(token, limiteMidias);
        if (rawPosts.length === 0) {
          console.warn("[Meta API] Falha ao recuperar ID da conta de negócios do Instagram.");
        }
      } catch (err) {
        console.error("[Meta API] Erro ou timeout ao obter dados do Instagram Graph:", err.message);
      }
    } else {
      console.log("[Meta API] META_ACCESS_TOKEN ausente. Pulando busca de dados reais.");
    }

    // 2. Calcular o primeiro e o último dia do mês atual para a análise
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const { inicioMes: primeiroDia, inicioProximoMes } = obterPeriodoMesVigente(hoje);
    const ultimoDia = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
    
    const formatarData = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const periodoStr = `${formatarData(primeiroDia)} a ${formatarData(ultimoDia)}`;

    let postsCampanha = [];

    if (rawPosts.length > 0) {
      console.log(`[Insights] Filtrando ${rawPosts.length} posts do mês atual (${periodoStr})...`);
      
      // Filtrar posts do mês atual
      let postsPeriodo = rawPosts.filter(p => {
        return dataEstaNoMesVigente(p.timestamp, { inicioMes: primeiroDia, inicioProximoMes });
      });

      // Sem fallback para mês anterior: a campanha vigente deve usar somente posts do mês atual
      if (postsPeriodo.length === 0) {
        console.log("[Insights] Nenhum post real no mês atual. Mantendo análise sem posts antigos.");
      }

      // EXCLUSÃO OBRIGATÓRIA: Excluir qualquer post derivado de gerar posts, mock, supabase, catalogo, etc.
      const excluirPalavras = [
        "gerar posts",
        "sugestão",
        "mock",
        "supabase",
        "catalogo",
        "catálogo",
        "ambiente oficial",
        "post sugerido"
      ];
      
      let postsValidos = postsPeriodo.filter(p => {
        const legendaLower = (p.legenda || "").toLowerCase();
        return !excluirPalavras.some(w => legendaLower.includes(w));
      });

      // FILTRO DE CAMPANHA: legendas contendo keywords da campanha "Exterminador do Prejuízo"
      const keywordsCampanha = [
        "exterminador",
        "prejuízo",
        "prejuizo",
        "desconto",
        "promoção",
        "porcelanato",
        "campanha"
      ];
      
      const postsComPalavrasChave = postsValidos.filter(p => {
        const legendaLower = (p.legenda || "").toLowerCase();
        return keywordsCampanha.some(kw => legendaLower.includes(kw));
      });

      if (postsComPalavrasChave.length > 0) {
        console.log(`[Insights] Encontrados ${postsComPalavrasChave.length} posts reais da campanha vigente. Analisando apenas estes.`);
        postsCampanha = postsComPalavrasChave;
      } else {
        console.log("[Insights] Nenhum post específico da campanha vigente encontrado. Analisando todos os posts reais do período, exceto excluídos.");
        postsCampanha = postsValidos;
      }
    }

    // 3. Strict Meta API Check - Se nenhum post real for retornado, responder com erro
    if (postsCampanha.length === 0) {
      console.log("[Insights] Nenhum post real publicado atende aos critérios no período selecionado.");
      return res.json({
        success: false,
        erro: "Nenhum post real publicado encontrado na Meta API para análise."
      });
    }

    // 4. Classificação automatizada por score e tipo
    const ordenadosInteracoes = [...postsCampanha].sort((a, b) => b.interacoes - a.interacoes);
    const ordenadosAlcance = [...postsCampanha].sort((a, b) => b.reach - a.reach);
    const ordenadosEngajamento = [...postsCampanha].sort((a, b) => b.engajamento - a.engajamento);
    const ordenadosSaves = [...postsCampanha].sort((a, b) => b.saves - a.saves);
    const ordenadosScore = [...postsCampanha].sort((a, b) => b.score - a.score);

    postsCampanha.forEach(post => { post.analiseFlag = null; });

    const videoPrincipal = postsCampanha.find(p => p.tipo === "VIDEO" && p.id === ordenadosAlcance.find(x => x.tipo === "VIDEO")?.id);
    if (videoPrincipal) videoPrincipal.analiseFlag = "video_principal";

    const topCarousel = postsCampanha.find(p => p.tipo === "CAROUSEL_ALBUM" && p.id === ordenadosInteracoes.find(x => x.tipo === "CAROUSEL_ALBUM")?.id);
    if (topCarousel && !topCarousel.analiseFlag) topCarousel.analiseFlag = "top_carousel";

    const topReel = postsCampanha.find(p => p.tipo === "VIDEO" && p.id === ordenadosInteracoes.find(x => x.tipo === "VIDEO" && x.id !== videoPrincipal?.id)?.id);
    if (topReel && !topReel.analiseFlag) topReel.analiseFlag = "top_reel";

    const maxAlcance = postsCampanha.find(p => p.id === ordenadosAlcance[0]?.id);
    if (maxAlcance && !maxAlcance.analiseFlag) maxAlcance.analiseFlag = "maior_alcance";

    const maxEngaj = postsCampanha.find(p => p.id === ordenadosEngajamento[0]?.id);
    if (maxEngaj && !maxEngaj.analiseFlag) maxEngaj.analiseFlag = "maior_engajamento";

    const maxSaves = postsCampanha.find(p => p.id === ordenadosSaves[0]?.id);
    if (maxSaves && !maxSaves.analiseFlag) maxSaves.analiseFlag = "maior_retencao";

    const minDesempenho = postsCampanha.find(p => p.id === ordenadosScore[ordenadosScore.length - 1]?.id);
    if (minDesempenho && !minDesempenho.analiseFlag) minDesempenho.analiseFlag = "pior_desempenho";

    postsCampanha.forEach(post => { post.recomendacaoImpulsionamento = false; });
    const topScorePost = postsCampanha.find(p => p.id === ordenadosScore[0]?.id);
    if (topScorePost) {
      topScorePost.recomendacaoImpulsionamento = true;
    }

    if (apenasMetricas) {
      return res.json({
        success: true,
        resumo: {
          totalPostsAnalisados: postsCampanha.length,
          periodo: periodoStr,
          criterioAnalise: "Posts do mês atual",
          campanhaVigente: "Campanha vigente do mês atual",
          melhorPost: topScorePost ? topScorePost.legenda.slice(0, 50) + "..." : "Não identificado",
          melhorFormato: topScorePost ? (topScorePost.tipo === "VIDEO" ? "Reels" : "Carrossel") : "Não identificado",
          recomendacaoPrincipal: "Métricas atualizadas pela Meta API. Abra o módulo para gerar a análise estratégica completa."
        },
        postsInsights: postsCampanha
      });
    }

    // 5. Preparação dos posts para a OpenAI - Ordenado por Score e Limitado a no máximo 15 posts
    const postsParaIA = [...postsCampanha]
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    const postsSimples = postsParaIA.map(p => ({
      id: p.id,
      tipo: p.tipo,
      legenda: p.legenda.slice(0, 150) + "...",
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      reach: p.reach,
      engajamento: p.engajamento,
      score: p.score,
      analiseFlag: p.analiseFlag
    }));

    const promptIa = `
Você é o Mestre Técnico de Marketing da Porcelanato Shop, um analista de tráfego pago de elite.
Sua tarefa é analisar o desempenho dos posts reais publicados no Instagram da campanha de porcelanato vigente ("Exterminador do Prejuízo") no mês atual. Todos os dados abaixo são oriundos exclusivamente da Meta API — nenhum dado estimado ou fictício foi incluído.

Posts analisados (máximo 15 de maior performance):
${JSON.stringify(postsSimples, null, 2)}

O Score Real Ponderado foi calculated como: score = (likes * 1) + (comments * 4) + (shares * 5) + (saves * 6).

DIRETRIZES DE ANÁLISE ESTRATÉGICA A CONSIDERAR:
1. Diferença entre Post Viral (alto engajamento/alcance por humor ou curiosidade, mas pouca intenção de compra) e Post Vendedor (focado em produto, ofertas de Ceusa/Portinari/Eliane e CTAs comerciais).
2. Geração de Conversas (Direct/WhatsApp): Quais posts têm o melhor gancho comercial para impulsionar e levar a audiência para iniciar conversas de vendas no WhatsApp.
3. Visitas na Loja Física: Identificar se há elementos no criativo ou ganchos úteis para atrair clientes a visitarem a loja física em Tubarão/SC.
4. Remarketing: Detectar quais posts com alto salvamento (saves) ou visualização contínua (ex: carrossel polido vs acetinado) são excelentes bases para criar públicos de remarketing.

Retorne estritamente um objeto JSON válido (sem tags markdown de bloco \`\`\`json nas laterais, apenas o texto bruto JSON) contendo exatamente estas seis chaves:
1. "analiseMarkdown": Uma análise estratégica de marketing de alto nível em formato Markdown. Ela DEVE ser rica, detalhada e cobrir:
   - **Desempenho da Campanha**: Análise geral da recepção do público.
   - **Diferença Viral vs Vendedor & Remarketing**: Como separar e usar os dois criativos estrategicamente.
   - **Detalhamento de Impulsionamento**: Análise técnica detalhada de qual post impulsionar, com objetivo ideal, orçamento sugerido e justificativa de ROI direcionando a leads no WhatsApp ou visitas físicas.
   - **Ganchos & Temas**: Comparação dos ganchos (preço, segurança antiderrapante, etc).
2. "observacoesPosts": Um objeto onde as chaves são os IDs dos posts e os valores são observações curtas da IA (de 1 a 2 frases) explicando o motivo do seu desempenho e a recomendação imediata para aquele post específico.
3. "objetivosPosts": Um objeto onde as chaves são os IDs dos posts e os valores são uma das 5 classificações de objetivo provável para cada post: "viralizacao", "conversao", "autoridade", "remarketing" ou "catalogo".
4. "melhorPost": O título/tema curto do melhor post (ex: "Reels de Piso Antiderrapante Ceusa").
5. "melhorFormato": O formato de conteúdo que mais se destacou (ex: "Carrossel Educativo" ou "Reels Dinâmico").
6. "recomendacaoPrincipal": A recomendação estratégica central para a loja (ex: "Focar em Reels com ganchos de medo de prejuízo na obra e direcionar tráfego para o WhatsApp").

Lembre-se de retornar APENAS o JSON válido para que possamos parsear diretamente via JSON.parse().
`;

    // 6. Comunicação com a OpenAI protegida por Fallback Completo contra travamentos/erros
    let analiseJson = {
      analiseMarkdown: "### Análise Estratégica da Campanha: Exterminador do Prejuízo\n\nNão foi possível obter a análise detalhada gerada por inteligência artificial no momento. No entanto, sua telemetria de posts está consolidada abaixo, permitindo que você avalie o score ponderado de cada post para tomar decisões de tráfego pago baseadas em dados reais de interação.",
      observacoesPosts: {},
      objetivosPosts: {},
      melhorPost: topScorePost ? (topScorePost.legenda.slice(0, 50) + "...") : "Não identificado",
      melhorFormato: topScorePost ? (topScorePost.tipo === "VIDEO" ? "Reels" : "Carrossel") : "Reels",
      recomendacaoPrincipal: "Aproveitar o engajamento orgânico do post de maior score para impulsionar tráfego direto para o atendimento no WhatsApp."
    };

    try {
      console.log("[OpenAI] Solicitando análise estratégica à OpenAI...");
      // Timeout implícito nas chamadas da OpenAI para evitar travamentos
      const textoIA = await gerarTextoIA(promptIa, 1800);
      const parsed = JSON.parse(limparJson(textoIA));
      if (parsed) {
        analiseJson = { ...analiseJson, ...parsed };
        console.log("[OpenAI] Resposta da OpenAI processada com sucesso.");
      }
    } catch (e) {
      console.error("[OpenAI] Falha ou timeout na OpenAI. Prosseguindo com fallback de análise seguro.", e.message);
    }

    postsCampanha.forEach(post => {
      post.observacaoIA = analiseJson.observacoesPosts?.[post.id] || "Desempenho saudável. Ótimo criativo para atração de leads.";
      post.objetivoProvavel = analiseJson.objetivosPosts?.[post.id] || "conversao";
    });

    console.log("[Insights] Resposta gerada com sucesso. Enviando dados ao painel.");
    res.json({
      success: true,
      analise: analiseJson.analiseMarkdown,
      resumo: {
        totalPostsAnalisados: postsCampanha.length,
        periodo: periodoStr,
        criterioAnalise: "Posts do mês atual",
        campanhaVigente: "Campanha vigente do mês atual",
        melhorPost: analiseJson.melhorPost || "Não identificado",
        melhorFormato: analiseJson.melhorFormato || "Reels",
        recomendacaoPrincipal: analiseJson.recomendacaoPrincipal || "Aproveitar o engajamento orgânico para conversão."
      },
      postsInsights: postsCampanha
    });
  } catch (error) {
    console.error("[Insights] Erro crítico no endpoint /instagram-insights:", error);
    res.status(500).json({ erro: "Erro ao gerar insights avançados" });
  }
});

app.post("/ideias-reels", async (req, res) => {
  try {
    const analise = await gerarTextoIA(`
Crie 7 ideias de Reels engraçados e comerciais para loja de porcelanatos.

Cada ideia deve conter:
- título
- roteiro curto
- cena na loja
- produto em destaque
- CTA
- prompt de imagem IA
`, 1400);

    res.json({ analise });
  } catch (error) {
    console.error("Erro /ideias-reels:", error);
    res.status(500).json({ erro: "Erro ao gerar ideias de Reels" });
  }
});

app.post("/tendencias-fabricas", async (req, res) => {
  try {
    const analise = await gerarTextoIA(`
Liste tendências atuais de porcelanatos e revestimentos para os fornecedores:
${fornecedores.join(", ")}

Para cada tendência, inclua:
- nome da tendência
- fornecedor relacionado
- aplicação em ambiente
- sugestão de post
- prompt de imagem IA
`, 1400);

    res.json({ analise });
  } catch (error) {
    console.error("Erro /tendencias-fabricas:", error);
    res.status(500).json({ erro: "Erro ao gerar tendências" });
  }
});

// HELPER INTERNO: Busca top conteúdos para o Motor de IA sem afetar a rota oficial
async function obterTopConteudosReaisHelper() {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) return [];

    const pageRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account&access_token=${token}`);
    const pageData = await pageRes.json();
    
    const igAccount = pageData.data?.find(p => p.instagram_business_account)?.instagram_business_account?.id;
    if (!igAccount) return [];

    const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${igAccount}/media?fields=id,media_type,caption,like_count,comments_count,timestamp&limit=20&access_token=${token}`);
    const mediaData = await mediaRes.json();
    
    if (!mediaData.data) return [];

    const periodoMes = obterPeriodoMesVigente();
    const postsMesAtual = mediaData.data.filter(m => dataEstaNoMesVigente(m.timestamp, periodoMes));

    const posts = postsMesAtual.map(m => {
      const interacoes = (m.like_count || 0) + (m.comments_count || 0);
      const legenda = typeof m.caption === "string" ? m.caption.slice(0, 120) + "..." : "Sem legenda";
      return { tipo: m.media_type, legenda, interacoes };
    });

    return posts.sort((a, b) => b.interacoes - a.interacoes).slice(0, 5);
  } catch (e) {
    console.error("Fallback ativado no helper de top conteudos:", e);
    return [];
  }
}

async function obterProdutosValidadosBanco(fornecedoresPermitidos = fornecedores) {
  if (!SUPABASE_KEY || !SUPABASE_URL) {
    console.warn("⚠️ SUPABASE_URL ou SUPABASE_KEY não configurado em .env. Pulando injeção de contexto.");
    return { textoContexto: "", ambientesDb: [] };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 segundos de timeout seguro

    // 1. Buscar todos os fornecedores cadastrados
    const resF = await fetch(`${SUPABASE_URL}/rest/v1/fornecedores?select=id,nome`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      },
      signal: controller.signal
    });
    
    if (!resF.ok) {
      clearTimeout(timeoutId);
      return { textoContexto: "", ambientesDb: [] };
    }
    const fornecedoresDbRaw = await resF.json();
    const permitidosLower = fornecedoresPermitidos.map((f) => f.toLowerCase());
    const fornecedoresDb = fornecedoresDbRaw.filter((f) =>
      permitidosLower.includes(String(f.nome || "").toLowerCase())
    );

    // 2. Buscar imagens de catálogo tipo 'ambiente' (nossos recortes validados)
    const resI = await fetch(`${SUPABASE_URL}/rest/v1/imagens_catalogo?select=*&tipo=eq.ambiente`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      },
      signal: controller.signal
    });
    
    if (!resI.ok) {
      clearTimeout(timeoutId);
      return { textoContexto: "", ambientesDb: [] };
    }
    const ambientesDb = await resI.json();
    clearTimeout(timeoutId);

    // Organizar contexto por fornecedor
    let textoContexto = "=== CONTEXTO DE PRODUTOS/AMBIENTES VALIDADOS NO BANCO ===\n";
    
    for (const f of fornecedoresDb) {
      textoContexto += `\nFornecedor: ${f.nome}\n`;
      
      // Filtra dinamicamente os ambientes que pertencem a este fornecedor
      const ambientesF = ambientesDb.filter(amb => 
        amb.url_imagem &&
        urlImagemPertenceAoFornecedor(amb.url_imagem, f.nome)
      );
      
      if (ambientesF.length === 0) {
        textoContexto += `* (NENHUM produto ou catálogo validado no banco de dados ainda. IMPORTANTE: Para este fornecedor, você está PROIBIDO de criar posts comerciais com nomes de modelos, acabamento ou medidas fictícias. Crie APENAS posts de inspiração genérica, sem citar especificações técnicas!)\n`;
      } else {
        textoContexto += `* Ambientes Oficiais/Validados Disponíveis (Você deve criar posts comerciais baseados nestes ambientes reais):\n`;
        for (const amb of ambientesF) {
          textoContexto += `  - Descrição/Nome real do ambiente: "${amb.descricao}" | Página: ${amb.pagina} | URL da Imagem Oficial: ${amb.url_imagem}\n`;
        }
      }
    }

    return { textoContexto, ambientesDb };
  } catch (error) {
    console.warn("⚠️ Fallback ativado: erro de conexão com o Supabase. Montando contexto vazio. Detalhes:", error.message);
    return { textoContexto: "", ambientesDb: [] };
  }
}

async function gerarPostsHandler(req, res) {
  try {
    const { textoContexto: contextoBanco, ambientesDb } = await obterProdutosValidadosBanco(fornecedoresGerarPosts);
    const imagensOficiaisUsadas = new Set();
    const imagensSugeridasContexto = new Set();
    const ambientesPrioritariosFornecedor = fornecedoresGerarPosts
      .map((fornecedor) => selecionarAmbienteOficialUnico(ambientesDb, fornecedor, imagensSugeridasContexto))
      .filter(Boolean);
    const contextoAmbientesPrioritarios = montarContextoAmbientesPrioritarios(ambientesPrioritariosFornecedor);
    const topReais = await obterTopConteudosReaisHelper();
    let contextoTop = "Nenhum dado real disponível no momento. Crie conteúdos puramente baseados em tendências.";
    if (topReais.length > 0) {
      contextoTop = topReais.map(p => `- Tipo: ${p.tipo} | Interações: ${p.interacoes} | Legenda (trecho): ${p.legenda}`).join("\n");
      if (contextoTop.length > 1500) contextoTop = contextoTop.slice(0, 1500) + "...";
    }

    const perguntasConsumidor = `
- porcelanato polido ou acetinado?
- porcelanato escorrega?
- qual porcelanato usar na área externa?
- porcelanato mancha?
- porcelanato amadeirado vale a pena?
- porcelanato grande é melhor?
- qual rejunte usar?
- porcelanato para banheiro
- porcelanato para cozinha
- porcelanato para sala
- como limpar porcelanato?
- porcelanato risca?
- porcelanato retificado
- porcelanato brilhante ou fosco?
- porcelanato para garagem`;

    const baseSchema = `
Retorne SOMENTE JSON válido, sem markdown.
Formato obrigatório para CADA POST:
[
  {
    "categoriaEstrategica": "",
    "tema": "",
    "gancho": "",
    "legenda": "",
    "cta": "",
    "fornecedor": "",
    "produto": "",
    "promptImagem": "",
    "perguntaConsumidor": "",
    "inspiracaoTopConteudos": "",
    "relacaoPromocaoMes": "",
    "scoreComercial": 90,
    "justificativaScore": "",
    "formatoSugerido": "Reels, Feed, Story, Carrossel",
    "potencialWhatsApp": "Alto/Médio/Baixo",
    "potencialSalvamento": "Alto/Médio/Baixo",
    "potencialViral": "Alto/Médio/Baixo",
    "potencialArquitetos": "Alto/Médio/Baixo",
    "potencialVendaImediata": "Alto/Médio/Baixo"
  }
]
Regras:
- O scoreComercial deve ser numérico (0 a 100).
- Para post de produto, fornecedor deve ser exatamente um destes: ${fornecedoresGerarPosts.join(", ")}.
- Para post educativo/genérico, fornecedor deve ser "Geral" e produto deve ficar vazio.
- Quando o tema comparar dois produtos, acabamentos ou categorias, cite explicitamente os dois nomes completos durante toda a legenda. Nunca substitua por termos genéricos ou pronomes como "o produto", "o porcelanato", "ele", "o mesmo" ou "o". Exemplo correto: "o porcelanato polido possui brilho intenso" e "o porcelanato acetinado possui acabamento fosco". Exemplo incorreto: "o porcelanato possui brilho intenso" ou "já o possui acabamento fosco".
- Não use nomes de campanhas internas como base principal para tema, gancho, legenda ou CTA. Evite citar "Exterminador do Prejuízo", "Matrix Descontos", "Convocação", "Operação" ou expressões como "campanha [nome da campanha]", salvo autorização explícita no pedido.
- Campanhas internas servem apenas como contexto promocional. O texto final deve priorizar fornecedor, produto/coleção, ambiente da imagem, acabamento, benefício real para o cliente e convite para WhatsApp ou loja física.
- O campo promptImagem deve ser URL oficial somente quando vier do contexto do banco; caso contrário, deve ser um prompt excelente para gerar imagem realista e bem relacionada ao assunto do post.`;

    // --- CÓRTEX 1: Fornecedores (2 posts) ---
    const promptFornecedores = `
Atue como Motor Inteligente de Marketing para a Porcelanato Shop. Crie 2 posts para Instagram focados em FORNECEDORES e PRODUTOS.
Fornecedores permitidos nesta etapa: ${fornecedoresGerarPosts.join(", ")}.

${contextoBanco}

${contextoAmbientesPrioritarios}

MUITO IMPORTANTE - REGRAS DE CONSISTÊNCIA E VALIDAÇÃO:
0. Cada post deve citar somente UMA marca. Nunca misture fornecedores no mesmo tema, gancho, legenda ou CTA.
0.1. Para posts de fornecedor específico, comece preferencialmente por produto/imagem oficial do banco.
0.2. Use os ambientes oficiais prioritários acima como ponto de partida: primeiro produto/imagem real, depois tema, gancho, legenda e CTA.
0.3. Use o campo "Uso/acabamento interpretado" para adequar a promessa do post: externo, interno, polido, natural, acetinado ou antiderrapante.
0.4. Não repita a mesma URL de imagem oficial em posts diferentes.
1. Para fornecedores que possuem "Ambientes Oficiais/Validados" listados no contexto acima:
   - Crie posts comerciais focados EXCLUSIVAMENTE em um desses ambientes reais do banco.
   - Use exatamente o nome/descrição real fornecido no contexto.
   - Preencha "produto" com essa descrição real.
   - Coloque no campo "promptImagem" a exata "URL da Imagem Oficial" fornecida para o ambiente correspondente. Isso garantirá consistência perfeita!
2. Para fornecedores que NÃO possuem produtos ou ambientes validados no contexto:
   - Você está terminantemente PROIBIDO de citar qualquer nome de modelo técnico, coleção fictícia, formato (medida) ou acabamento (como "Urban Acetinado", "60x120").
   - Crie posts de INSPIRAÇÃO GENÉRICA e de tendências de design de interiores associadas a essa marca (ex: "A elegância dos porcelanatos Ceusa", "Como paginar ambientes com Ceusa").
   - Nesses posts genéricos, deixe o campo "promptImagem" em branco ou descreva um prompt abstrato e marque a "imagemOficial" como null.

Defina categoriaEstrategica como "Fornecedor".
${baseSchema}`;

    // --- CÓRTEX 2: Dúvidas do Consumidor (2 posts) ---
    const promptDuvidas = `
Atue como Motor Inteligente de Marketing para a Porcelanato Shop. Crie 2 posts educativos para Instagram baseados nestas DÚVIDAS DO CONSUMIDOR:
${perguntasConsumidor}
Foco: Responder a dúvida, conteúdo educativo, gerar salvamentos e alcance orgânico.
Esses posts podem ser sobre limpeza, manutenção, escolha de porcelanato, acabamentos, curiosidades, cerâmicas e revestimentos.
Não invente produto específico. Use fornecedor "Geral" e produto vazio, exceto se a dica for claramente sobre uma única marca permitida.
Use promptImagem descritivo e bem relacionado ao assunto, próprio para gerar imagem IA, sem marcar como imagem oficial.
Defina categoriaEstrategica como "Dúvida do Consumidor".
${baseSchema}`;

    // --- CÓRTEX 3: Derivados Campeões e Promoção (3 posts) ---
    const promptDerivados = `
Atue como Motor Inteligente de Marketing para a Porcelanato Shop. Crie 3 posts para Instagram focados em replicar os padrões dos conteúdos que MAIS FIZERAM SUCESSO.
DADOS DOS TOP CONTEÚDOS REAIS:
${contextoTop}
Use esses posts reais apenas como inspiração de linguagem, formato e gancho. Eles não devem limitar a geração nem substituir produtos reais, imagens oficiais, tendências e dúvidas comuns sobre porcelanato.
Use a campanha atual apenas como contexto interno de promoção, sem citar nomes de campanhas internas no texto final. Não copie os posts; extraia a estratégia vencedora e transforme em tema, gancho, legenda e CTA claros para o cliente.
Pode criar posts educativos, curiosidades e utilidades sobre porcelanatos, cerâmicas e revestimentos. Se for produto, use somente uma marca entre ${fornecedoresGerarPosts.join(", ")}. Se for educativo/genérico, use fornecedor "Geral".
Não cite fornecedores fora da lista permitida.
Para posts educativos/genéricos, use promptImagem descritivo e relacionado ao tema, sem inventar produto específico.
Defina categoriaEstrategica como "Derivado Campeão".
${baseSchema}`;

    // Executa as 3 estratégias em paralelo (Isolamento de Alucinação)
    const [resFornecedores, resDuvidas, resDerivados] = await Promise.all([
      gerarTextoIA(promptFornecedores, 1200).catch(() => "[]"),
      gerarTextoIA(promptDuvidas, 1200).catch(() => "[]"),
      gerarTextoIA(promptDerivados, 1500).catch(() => "[]")
    ]);

    const parseSeguro = (txt) => {
      try {
        if (txt.length > 15000) return [];
        const limpo = limparJson(txt);
        const obj = JSON.parse(limpo);
        return Array.isArray(obj) ? obj : (obj.posts || []);
      } catch {
        return [];
      }
    }

    let posts = [
      ...parseSeguro(resFornecedores),
      ...parseSeguro(resDuvidas),
      ...parseSeguro(resDerivados)
    ];

    // Fallback absoluto: Garantir 7 posts
    while (posts.length < 7) {
      const fallbackDerivados = parseSeguro(resDerivados);
      if (fallbackDerivados.length > 0) {
        posts.push({
           ...fallbackDerivados[posts.length % fallbackDerivados.length],
           tema: fallbackDerivados[posts.length % fallbackDerivados.length].tema + " (Bônus Campeão)"
        });
      } else {
        posts.push({
          categoriaEstrategica: "Derivado Campeão",
          tema: "Destaque Porcelanato Premium",
          gancho: "Aproveite a campanha Exterminador do Prejuízo",
          legenda: "Renove seu ambiente com nossas coleções premium. Chame no WhatsApp!",
          cta: "Visite a Porcelanato Shop",
          fornecedor: "Portinari",
          promptImagem: "Porcelanato premium em ambiente moderno, alta resolução",
          scoreComercial: 85
        });
      }
    }
    
    posts = posts.slice(0, 7);

    const postsTratados = await Promise.all(
      posts.slice(0, 7).map(async (post) => {
        const fornecedor =
          post.fornecedor ||
          detectarFornecedor(JSON.stringify(post)) ||
          "Não identificado";
        const fornecedorBuscaImagem = obterFornecedorBusca(fornecedor) || fornecedor;

        // Trava de validação e consistência defensiva
        let imagemOficial = null;
        let imagemOficialStatus = "nao_encontrada";
        let aviso = null;
        let legendaSegura = post.legenda || "";

        // --- VARIÁVEIS DE COERÊNCIA VISUAL ---
        let descricaoAmbiente = "";
        const termosExternos = ["área externa", "antiderrapante", "garagem", "varanda", "piscina", "fachada", "escorregamento"];
        const eTemaExterno = termosExternos.some(termo => 
          (post.tema || "").toLowerCase().includes(termo) ||
          (post.gancho || "").toLowerCase().includes(termo) ||
          (legendaSegura || "").toLowerCase().includes(termo)
        );

        // 1. Extrair fornecedores individuais (tratando múltiplos fornecedores)
        const fornecedoresPost = fornecedorBuscaImagem.split(',')
          .map((s) => s.trim())
          .map((parte) => obterFornecedorBusca(parte, fornecedoresGerarPosts))
          .filter((fornecedor) => fornecedor && fornecedor.toLowerCase() !== "não identificado");

        // 2. Verificar se algum dos fornecedores tem catálogo no banco
        const fornecedoresComCatalogo = fornecedoresPost.filter((fornecedor, index, lista) =>
          lista.indexOf(fornecedor) === index &&
          (ambientesDb || []).some((amb) => urlImagemPertenceAoFornecedor(amb.url_imagem, fornecedor))
        );
        const temCatalogoBanco = fornecedoresComCatalogo.length > 0;

        const temImagemBanco = typeof post.promptImagem === "string" && post.promptImagem.startsWith("http");

        if (temImagemBanco) {
          // Se a IA gerou uma URL diretamente
          imagemOficial = post.promptImagem;
          imagemOficialStatus = "validada_catalogo";
          console.log(`[Gerar Posts] 🟢 Imagem Validada pelo Catálogo do Banco (Supabase) para ${fornecedor}: ${imagemOficial}`);
          const matchAmb = (ambientesDb || []).find(amb => amb.url_imagem === imagemOficial);
          if (matchAmb) {
            descricaoAmbiente = matchAmb.descricao || "";
          }

          if (imagensOficiaisUsadas.has(imagemOficial)) {
            const alternativa = escolherAmbienteAlternativoNaoUsado(ambientesDb, fornecedorBuscaImagem, imagensOficiaisUsadas, imagemOficial);
            if (alternativa) {
              imagemOficial = alternativa.url_imagem;
              descricaoAmbiente = alternativa.descricao || "";
              post.produto = descricaoAmbiente;
              post.perguntaConsumidor = post.perguntaConsumidor || alternativa.usoInterpretado;
              aviso = "Imagem oficial substituída para evitar repetição na mesma geração";
            } else {
              imagemOficial = null;
              imagemOficialStatus = "nao_encontrada";
              aviso = "Imagem oficial não usada por falta de alternativa disponível no catálogo";
            }
          }

          if (imagemOficial) {
            imagensOficiaisUsadas.add(imagemOficial);
          }
          
          if (!temCatalogoBanco) {
            // Trava anti-alucinação se não tem catálogo
            console.log(`[Gerar Posts] 🛡️ Trava Anti-Alucinação Ativada para Fornecedor sem catálogo: ${fornecedor}`);
            aviso = "Produto não validado no catálogo oficial";
            imagemOficialStatus = "produto_nao_validado";

            legendaSegura = legendaSegura
              .replace(/\b\d{2,3}x\d{2,3}\b/gi, "")
              .replace(/\b(acetinado|polido|retificado|mate|brilhante|lapado|natural)\b/gi, "")
              .trim();

            if (!legendaSegura || legendaSegura.includes("coleção") || legendaSegura.includes("Coleção") || legendaSegura.toLowerCase().includes("urban")) {
              legendaSegura = `Inspire-se com a elegância e sofisticação que os porcelanatos da ${fornecedor} trazem para o seu ambiente. Perfeito para quem busca alta durabilidade e acabamento impecável em cada detalhe de seu lar!`;
            }

            if (fornecedorBuscaImagem !== "Não identificado") {
              console.log(`[Gerar Posts] 🔍 Buscando imagem de inspiração genérica no Serper para ${fornecedorBuscaImagem}`);
              imagemOficial = await buscarImagemOficial(fornecedorBuscaImagem, "porcelanato revestimento");
              imagemOficialStatus = imagemOficial ? "fallback_generico" : "produto_nao_validado";
            }
          }
        } else {
          // Se a IA gerou um prompt textual (não URL)
          if (temCatalogoBanco) {
            // O fornecedor TEM catálogo, vamos pegar um ambiente real do banco!
            const ambientesF = (ambientesDb || []).filter(amb => 
              amb.url_imagem && 
              fornecedoresComCatalogo.some((fornecedor) => urlImagemPertenceAoFornecedor(amb.url_imagem, fornecedor))
            );

            if (ambientesF.length > 0) {
              const temaBusca = (post.tema || "").toLowerCase();
              
              // Filtragem ativa de ambientes externos para temas externos
              let ambientesFiltrados = ambientesF;
              if (eTemaExterno) {
                const externos = ambientesF.filter(amb => 
                  amb.descricao && 
                  ["área externa", "piscina", "fachada", "varanda", "garagem", "ambiente externo", "externo", "externa", "quintal", "antiderrapante"].some(termo => 
                    amb.descricao.toLowerCase().includes(termo)
                  )
                );
                if (externos.length > 0) {
                  ambientesFiltrados = externos;
                }
              }

              const correspondente = ambientesFiltrados.find(amb => 
                amb.descricao && temaBusca.includes(amb.descricao.toLowerCase())
              );
              
              const ambientesSemRepetir = ambientesFiltrados.filter(amb => !imagensOficiaisUsadas.has(amb.url_imagem));
              const candidatosImagem = ambientesSemRepetir;
              const ambEscolhido = correspondente && !imagensOficiaisUsadas.has(correspondente.url_imagem)
                ? correspondente
                : candidatosImagem[Math.floor(Math.random() * candidatosImagem.length)];

              if (ambEscolhido) {
                imagemOficial = ambEscolhido.url_imagem;
                imagensOficiaisUsadas.add(imagemOficial);
                imagemOficialStatus = "validada_catalogo";
                descricaoAmbiente = ambEscolhido.descricao || "";
                post.produto = post.produto || descricaoAmbiente;
                post.perguntaConsumidor = post.perguntaConsumidor || interpretarUsoProdutoBanco(fornecedor, descricaoAmbiente, imagemOficial);
                console.log(`[Gerar Posts] 🟢 Imagem do Banco recuperada como fallback dinâmico para ${fornecedor}: ${imagemOficial} (${descricaoAmbiente})`);
              } else {
                imagemOficial = null;
                imagemOficialStatus = "nao_encontrada";
                aviso = "Nenhuma imagem oficial alternativa disponível no catálogo para esta geração";
                console.warn(`[Gerar Posts] ⚠️ Imagem oficial omitida para evitar repetição: ${fornecedor}`);
              }
            } else {
              // Fallback se não encontrar
              const temaBusca = post.tema || post.gancho || "";
              imagemOficial = await buscarImagemOficial(fornecedorBuscaImagem, temaBusca);
              imagemOficialStatus = imagemOficial ? "fallback_generico" : "nao_encontrada";
            }
          } else {
            // Não tem catálogo no banco, ativamos trava anti-alucinação
            console.log(`[Gerar Posts] 🛡️ Trava Anti-Alucinação Ativada para Fornecedor sem catálogo (sem imagem URL): ${fornecedor}`);
            aviso = "Produto não validado no catálogo oficial";
            imagemOficialStatus = "produto_nao_validado";

            legendaSegura = legendaSegura
              .replace(/\b\d{2,3}x\d{2,3}\b/gi, "")
              .replace(/\b(acetinado|polido|retificado|mate|brilhante|lapado|natural)\b/gi, "")
              .trim();

            if (!legendaSegura || legendaSegura.includes("coleção") || legendaSegura.includes("Coleção") || legendaSegura.toLowerCase().includes("urban")) {
              legendaSegura = `Inspire-se com a elegância e sofisticação que os porcelanatos da ${fornecedor} trazem para o seu ambiente. Perfeito para quem busca alta durabilidade e acabamento impecável em cada detalhe de seu lar!`;
            }

            if (fornecedorBuscaImagem !== "Não identificado") {
              const temaBusca = post.tema || post.gancho || "";
              imagemOficial = await buscarImagemOficial(fornecedorBuscaImagem, temaBusca);
              imagemOficialStatus = imagemOficial ? "fallback_generico" : "produto_nao_validado";
            }
          }
        }

        const scoreSeguro = typeof post.scoreComercial === "number"
          ? Math.max(0, Math.min(100, post.scoreComercial))
          : null;

        // --- NOVA TRAVA: ALINHAMENTO DE FORNECEDOR ÚNICO PARA IMAGENS OFICIAIS ---
        let fornecedorFinal = fornecedor;
        let temaFinal = post.tema || "";
        let ganchoFinal = post.gancho || "";
        let legendaFinal = legendaSegura;

        if (imagemOficialStatus === "validada_catalogo" && typeof imagemOficial === "string" && imagemOficial.startsWith("http")) {
          const donoImagem = obterFornecedorDaImagemBanco(imagemOficial);

          if (donoImagem) {
            if (fornecedor.includes(",")) {
              // Se o post é sobre múltiplos fornecedores, mantemos o fornecedorFinal como o original
              // e não alteramos a legenda, preservando o texto original
              fornecedorFinal = fornecedor;
            } else {
              const outrosFornecedores = fornecedoresGerarPosts.filter(m => m.toLowerCase() !== donoImagem.toLowerCase());
              
              const citaOutrosLegenda = outrosFornecedores.some(m => legendaFinal.toLowerCase().includes(m.toLowerCase()));
              const citaOutrosTema = outrosFornecedores.some(m => temaFinal.toLowerCase().includes(m.toLowerCase()));
              const citaOutrosGancho = outrosFornecedores.some(m => ganchoFinal.toLowerCase().includes(m.toLowerCase()));

              if (citaOutrosLegenda || citaOutrosTema || citaOutrosGancho) {
                console.log(`[Gerar Posts] ⚠️ Conflito de Fornecedor: Imagem é de ${donoImagem}, mas o post cita outros.`);
                
                const marcasOrdenadas = [...fornecedoresGerarPosts].sort((a, b) => b.length - a.length);
                const marcaRegexStr = marcasOrdenadas.map(m => m.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');

                // Regex para sequências de pelo menos 2 marcas separadas por vírgula, mais, barra, "e", "ou" ou espaços
                const seqRegex = new RegExp(`\\b(${marcaRegexStr})\\b(?:(?:\\s*(?:,|\\+|e|ou|\\/)\\s*|\\s+(?=\\b(${marcaRegexStr})\\b))\\b(${marcaRegexStr})\\b)+`, 'gi');
                const singleRegex = new RegExp(`\\b(${marcaRegexStr})\\b`, 'gi');

                const substituirPorDono = (texto) => {
                  if (!texto) return texto;
                  // 1. Substituir sequências primeiro
                  let t = texto.replace(seqRegex, donoImagem);
                  // 2. Substituir marcas individuais remanescentes (que não sejam a do próprio dono)
                  t = t.replace(singleRegex, (match) => {
                    if (match.toLowerCase() === donoImagem.toLowerCase()) {
                      return match;
                    }
                    return donoImagem;
                  });
                  return t;
                };

                let legendaTest = substituirPorDono(legendaFinal);
                let temaTest = substituirPorDono(temaFinal);
                let ganchoTest = substituirPorDono(ganchoFinal);

                const aindaCitaOutros = outrosFornecedores.some(m => 
                  legendaTest.toLowerCase().includes(m.toLowerCase()) ||
                  temaTest.toLowerCase().includes(m.toLowerCase()) ||
                  ganchoTest.toLowerCase().includes(m.toLowerCase())
                );

                if (!aindaCitaOutros) {
                  console.log(`[Gerar Posts] 🟢 Higienização realizada com sucesso para o fornecedor único ${donoImagem}!`);
                  legendaFinal = legendaTest;
                  temaFinal = temaTest;
                  ganchoFinal = ganchoTest;
                  fornecedorFinal = donoImagem;
                } else {
                  console.log(`[Gerar Posts] 🛡️ Fallback de Segurança: Não foi possível higienizar marcas com total precisão. Removendo imagem oficial de ${donoImagem}.`);
                  imagemOficial = null;
                  imagemOficialStatus = "fallback_generico";
                  aviso = "Imagem oficial removida por conflito de fornecedor";
                }
              } else {
                fornecedorFinal = donoImagem;
              }
            }
          }
        }

        // --- NOVA TRAVA: COERÊNCIA VISUAL DE TEMA EXTERNO ---
        if (imagemOficialStatus === "validada_catalogo" && typeof imagemOficial === "string" && imagemOficial.startsWith("http")) {
          if (eTemaExterno) {
            const descricoesExternas = ["área externa", "piscina", "fachada", "varanda", "garagem", "ambiente externo", "externo", "externa", "quintal", "antiderrapante"];
            const eAmbienteExterno = descricoesExternas.some(termo => 
              descricaoAmbiente.toLowerCase().includes(termo) ||
              imagemOficial.toLowerCase().includes("externa") ||
              imagemOficial.toLowerCase().includes("piscina") ||
              imagemOficial.toLowerCase().includes("fachada") ||
              imagemOficial.toLowerCase().includes("varanda") ||
              imagemOficial.toLowerCase().includes("garagem")
            );

            if (!eAmbienteExterno) {
              console.log(`[Gerar Posts] 🛡️ Trava de Coerência Visual Externa Ativada! Tema é externo, mas a imagem é interna (${descricaoAmbiente}). Removendo.`);
              imagemOficial = null;
              imagemOficialStatus = "fallback_generico";
              aviso = "Imagem oficial removida por incompatibilidade com tema externo";
            }
          }
        }

        if (precisaCorrigirComparativoPolidoAcetinado(temaFinal, ganchoFinal, legendaFinal)) {
          legendaFinal = corrigirLegendaComparativoPolidoAcetinado(legendaFinal);
          aviso = aviso || "Legenda comparativa corrigida para citar porcelanato polido e porcelanato acetinado";
        }

        const linksFornecedorFinal = linksFornecedores[fornecedorFinal] || linksFornecedores[fornecedorBuscaImagem] || [];

        return {
          // CAMPOS OBRIGATÓRIOS DO FRONTEND ATUAL (NUNCA REMOVER)
          tema: temaFinal || "",
          gancho: ganchoFinal || "",
          legenda: legendaFinal,
          cta: post.cta || "Chame no WhatsApp ou visite nossa loja física.",
          fornecedor: fornecedorFinal,
          produto: post.produto || descricaoAmbiente || "",
          promptImagem: typeof post.promptImagem === "string" && post.promptImagem.startsWith("http")
            ? `Ambiente decorado oficial: ${temaFinal || ""}`
            : (post.promptImagem || `${temaFinal || ""}. Ambiente moderno com porcelanato premium.`),
          imagemOficial,
          imagemOficialStatus,
          aviso,
          linksFornecedor: linksFornecedorFinal,
          
          // NOVOS CAMPOS INTELIGENTES (OPCIONAIS NO FRONTEND ATUAL)
          categoriaEstrategica: post.categoriaEstrategica || null,
          perguntaConsumidor: post.perguntaConsumidor || null,
          inspiracaoTopConteudos: post.inspiracaoTopConteudos || null,
          relacaoPromocaoMes: post.relacaoPromocaoMes || null,
          scoreComercial: scoreSeguro,
          justificativaScore: post.justificativaScore || null,
          formatoSugerido: post.formatoSugerido || null,
          potencialWhatsApp: post.potencialWhatsApp || null,
          potencialSalvamento: post.potencialSalvamento || null,
          potencialViral: post.potencialViral || null,
          potencialArquitetos: post.potencialArquitetos || null,
          potencialVendaImediata: post.potencialVendaImediata || null
        };
      })
    );

    res.json({
      success: true,
      posts: postsTratados,
    });
  } catch (error) {
    console.error("Erro /gerar-posts:", error);

    res.status(500).json({
      success: false,
      erro: "Erro ao gerar posts",
      detalhes: error.message,
    });
  }
}

app.get("/gerar-posts", gerarPostsHandler);
app.post("/gerar-posts", gerarPostsHandler);

app.post("/gerar-imagem", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt não informado",
      });
    }

    const response = await openai.images.generate({
      model: "gpt-image-1-mini",
      prompt: `
Crie uma imagem ultra realista para Instagram de uma loja de porcelanatos.

Cena:
${prompt}

Estilo obrigatório:
- porcelanato em destaque
- arquitetura moderna
- iluminação natural
- ambiente sofisticado
- decoração contemporânea
- fotografia profissional
- visual premium
- sem texto
- sem logo
- sem marca d'água
`,
      size: "1024x1024",
      quality: "low",
    });

    const imageBase64 = response.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("Imagem não retornada pela API.");
    }

    res.json({
      success: true,
      imageUrl: `data:image/png;base64,${imageBase64}`,
    });
  } catch (error) {
    console.error("Erro /gerar-imagem:", error);

    res.status(500).json({
      success: false,
      error: "Erro ao gerar imagem IA",
      detalhes: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`
========================================
🚀 CENTRAL IA PORCELANATO SHOP
Servidor rodando na porta ${PORT}
http://localhost:${PORT}
========================================
`);

  setImmediate(() => {
    sincronizarCatalogosStorage({ origem: "startup" })
      .then((resultado) => importarPdfsSincronizados(resultado?.pdfsParaImportar || []))
      .catch((err) => console.error("[Sync Catálogos] Erro inesperado:", err.message));
  });
});
