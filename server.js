import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const fornecedores = [
  "Portinari",
  "Ceusa",
  "Eliane",
  "Elizabeth",
  "Embramaco",
  "Roca",
  "Incepa",
  "Delta",
  "Delta Nova",
];

const linksFornecedores = {
  Portinari: ["https://www.portinari.com.br/"],
  Ceusa: ["https://www.ceusa.com.br/"],
  Eliane: ["https://www.eliane.com/"],
  Elizabeth: ["https://www.grupoelizabeth.com.br/"],
  Embramaco: ["https://www.embramaco.com.br/"],
  Roca: ["https://www.roca.com.br/"],
  Incepa: ["https://www.incepa.com.br/"],
  Delta: ["https://www.deltaceramica.com.br/"],
  "Delta Nova": ["https://www.deltaceramica.com.br/"],
};

const dominiosOficiais = {
  Portinari: ["portinari.com.br"],
  Ceusa: ["ceusa.com.br"],
  Eliane: ["eliane.com"],
  Elizabeth: ["grupoelizabeth.com.br"],
  Embramaco: ["embramaco.com.br"],
  Roca: ["roca.com.br"],
  Incepa: ["incepa.com.br"],
  Delta: ["deltaceramica.com.br"],
  "Delta Nova": ["deltaceramica.com.br"],
};

function limparJson(texto) {
  return String(texto || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function detectarFornecedor(texto = "") {
  const lower = String(texto).toLowerCase();

  return (
    fornecedores.find((fornecedor) =>
      lower.includes(fornecedor.toLowerCase())
    ) || null
  );
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
    const analise = await gerarTextoIA(`
Crie uma análise da promoção "Exterminador do Prejuízo" para Instagram.

Inclua:
- ideia central
- pontos fortes
- sugestão de Reels
- CTA para WhatsApp
- CTA para loja física
- sugestão de imagem
- prompt de imagem IA
`, 1000);

    res.json({ analise });
  } catch (error) {
    console.error("Erro /promocao-vigente:", error);
    res.status(500).json({ erro: "Erro ao gerar promoção vigente" });
  }
});

async function topConteudosHandler(req, res) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
      return res.status(400).json({ erro: "META_ACCESS_TOKEN não configurado no .env" });
    }

    // 1. Descobrir IG Account ID
    const pageRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account&access_token=${token}`);
    const pageData = await pageRes.json();
    
    const igAccount = pageData.data?.find(p => p.instagram_business_account)?.instagram_business_account?.id;
    if (!igAccount) {
      return res.status(400).json({ erro: "Nenhuma conta Instagram vinculada identificada." });
    }

    // 2. Buscar mídias e métricas (Agora incluindo 'permalink')
    const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${igAccount}/media?fields=id,media_type,media_url,thumbnail_url,caption,like_count,comments_count,timestamp,permalink&limit=50&access_token=${token}`);
    const mediaData = await mediaRes.json();
    
    if (!mediaData.data) {
      return res.status(400).json({ erro: "Não foi possível resgatar as mídias do Instagram." });
    }

    // 3. Processar e Calcular Métricas (Top 10)
    const postsTratados = mediaData.data.map(m => {
      const likes = m.like_count || 0;
      const comments = m.comments_count || 0;
      
      const reach = m.reach || 0;
      const shares = m.shares || 0;
      const saves = m.saves || 0;
      
      const interacoes = likes + comments + shares + saves;
      
      let engajamento = reach > 0 ? ((interacoes / reach) * 100).toFixed(2) : interacoes;

      let imagemSegura = null;
      if (m.media_type === "VIDEO") {
        imagemSegura = m.thumbnail_url || null;
      } else if (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM") {
        imagemSegura = m.media_url || null;
      }
      
      const legendaSegura = typeof m.caption === "string" 
        ? (m.caption.length > 120 ? m.caption.slice(0, 120) + "..." : m.caption) 
        : "Sem legenda";
      
      return {
        id: m.id, tipo: m.media_type, imagem: imagemSegura,
        legenda: legendaSegura,
        permalink: m.permalink || null,
        likes, comments, shares, saves, reach, interacoes, engajamento,
        data: new Date(m.timestamp).toLocaleDateString("pt-BR")
      };
    });

    const top10 = postsTratados.sort((a, b) => b.interacoes - a.interacoes).slice(0, 10);

    res.json({ success: true, topConteudos: top10 });
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

app.post("/instagram-insights", async (req, res) => {
  try {
    const analise = await gerarTextoIA(`
Crie uma análise estratégica de Instagram para loja física de porcelanatos.

Inclua:
- o que observar nos insights
- quais posts priorizar
- quais métricas importam
- como transformar alcance em visitas na loja
- como transformar interação em WhatsApp
`, 1000);

    res.json({ analise });
  } catch (error) {
    console.error("Erro /instagram-insights:", error);
    res.status(500).json({ erro: "Erro ao gerar insights" });
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

    const mediaRes = await fetch(`https://graph.facebook.com/v18.0/${igAccount}/media?fields=id,media_type,caption,like_count,comments_count&limit=20&access_token=${token}`);
    const mediaData = await mediaRes.json();
    
    if (!mediaData.data) return [];

    const posts = mediaData.data.map(m => {
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

async function gerarPostsHandler(req, res) {
  try {
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
Regras: O scoreComercial deve ser numérico (0 a 100). O campo promptImagem deve ser excelente para gerar imagens realistas.`;

    // --- CÓRTEX 1: Fornecedores (2 posts) ---
    const promptFornecedores = `
Atue como Motor Inteligente de Marketing para a Porcelanato Shop. Crie 2 posts para Instagram focados EXCLUSIVAMENTE em FORNECEDORES e PRODUTOS REAIS.
Fornecedores permitidos: ${fornecedores.join(", ")}.

MUITO IMPORTANTE:
- Use nomes REAIS de coleções e acabamentos (ex: "Portinari coleção limestone acetinado 120x120").
- EVITE temas genéricos e adjetivos vazios como "luxo sofisticado moderno premium".
- O objetivo é que o título e tema sejam precisos para busca no Google Imagens (catálogo).

Defina categoriaEstrategica como "Fornecedor".
${baseSchema}`;

    // --- CÓRTEX 2: Dúvidas do Consumidor (2 posts) ---
    const promptDuvidas = `
Atue como Motor Inteligente de Marketing para a Porcelanato Shop. Crie 2 posts educativos para Instagram baseados nestas DÚVIDAS DO CONSUMIDOR:
${perguntasConsumidor}
Foco: Responder a dúvida, conteúdo educativo, gerar salvamentos e alcance orgânico.
Defina categoriaEstrategica como "Dúvida do Consumidor".
${baseSchema}`;

    // --- CÓRTEX 3: Derivados Campeões e Promoção (3 posts) ---
    const promptDerivados = `
Atue como Motor Inteligente de Marketing para a Porcelanato Shop. Crie 3 posts para Instagram focados em replicar os padrões dos conteúdos que MAIS FIZERAM SUCESSO.
DADOS DOS TOP CONTEÚDOS REAIS:
${contextoTop}
Alinhe também com a campanha atual: "Exterminador do Prejuízo" (humor, urgência, oferta). Não copie os posts, extraia e derive a estratégia vencedora.
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

        let imagemOficial = null;
        if (fornecedor !== "Não identificado") {
          const temaBusca = post.tema || post.gancho || "";
          console.log(`[Gerar Posts] 🔍 Tentativa primária por tema: ${fornecedor} + "${temaBusca}"`);
          imagemOficial = await buscarImagemOficial(fornecedor, temaBusca);
          
          if (!imagemOficial) {
            console.log(`[Gerar Posts] 🔄 Fallback acionado: buscando apenas pelo catálogo do fornecedor (${fornecedor})`);
            imagemOficial = await buscarImagemOficial(fornecedor, "");
          }
        }

        const scoreSeguro = typeof post.scoreComercial === "number"
          ? Math.max(0, Math.min(100, post.scoreComercial))
          : null;

        return {
          // CAMPOS OBRIGATÓRIOS DO FRONTEND ATUAL (NUNCA REMOVER)
          tema: post.tema || "",
          gancho: post.gancho || "",
          legenda: post.legenda || "",
          cta: post.cta || "Chame no WhatsApp ou visite nossa loja física.",
          fornecedor,
          promptImagem:
            post.promptImagem ||
            post.prompt_ia ||
            post.promptIA ||
            `${post.tema || ""}. ${post.gancho || ""}. Ambiente moderno com porcelanato premium.`,
          imagemOficial,
          imagemOficialStatus: imagemOficial ? "encontrada" : "nao_encontrada",
          linksFornecedor: linksFornecedores[fornecedor] || [],
          
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
});