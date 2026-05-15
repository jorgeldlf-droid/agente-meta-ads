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

      for (const img of images) {
        // Validação rigorosa + checagem de formato de imagem
        if (img.imageUrl && 
            validarDominioOficial(img.imageUrl, fornecedor) &&
            isFormatoImagemValido(img.imageUrl)) {
            
          console.log(`[Serper] 🟢 Encontrou | Fornecedor: ${fornecedor} | Query: "${query}"`);
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

async function gerarPostsHandler(req, res) {
  try {
    const prompt = `
Crie um calendário de 7 posts para Instagram da Porcelanato Shop.

Retorne SOMENTE JSON válido, sem markdown.

Formato obrigatório:
[
  {
    "tema": "",
    "gancho": "",
    "legenda": "",
    "cta": "",
    "fornecedor": "",
    "promptImagem": ""
  }
]

Regras:
- Um post para cada dia.
- Sempre favorecer porcelanato.
- Usar fornecedores reais da loja:
${fornecedores.join(", ")}
- Não inventar imagem oficial.
- Não criar URL de imagem oficial.
- O campo promptImagem deve ser muito bom para gerar imagem ultra realista de porcelanato.
- Linguagem comercial para Instagram.
- Foco em WhatsApp e loja física.
`;

    const texto = await gerarTextoIA(prompt, 2500);
    const jsonLimpo = limparJson(texto);

    let posts = JSON.parse(jsonLimpo);

    if (!Array.isArray(posts)) {
      posts = posts.posts || [];
    }

    const postsTratados = await Promise.all(
      posts.slice(0, 7).map(async (post) => {
        const fornecedor =
          post.fornecedor ||
          detectarFornecedor(JSON.stringify(post)) ||
          "Não identificado";

        const imagemOficial =
          fornecedor !== "Não identificado"
            ? await buscarImagemOficial(fornecedor, post.tema || post.gancho)
            : null;

        return {
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