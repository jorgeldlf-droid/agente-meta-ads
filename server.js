import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const INSTAGRAM_BUSINESS_ID = "17841408736636861";

const marcas = [
  "Portinari porcelanato lançamento",
  "Ceusa porcelanato lançamento",
  "Eliane porcelanato lançamento",
  "Elizabeth porcelanato lançamento",
  "Embramaco porcelanato lançamento",
  "Roca porcelanato lançamento",
  "Incepa porcelanato lançamento",
  "Delta porcelanato lançamento",
  "Delta Nova porcelanato lançamento",
];

const perguntasPorcelanato = [
  "Qual o preço do m2 do porcelanato?",
  "Quais são os 3 tipos de porcelanato?",
  "Quanto um pedreiro cobra para assentar 1 m2 de porcelanato?",
  "Qual o valor de 1 m2 de porcelanato para assentar?",
  "Qual porcelanato mais usado hoje em dia?",
  "Qual o piso mais usado hoje?",
  "Quantos pisos vem em uma caixa de porcelanato 60x60?",
  "Qual a melhor marca de porcelanato e o mais barato?",
  "Quantos metros de piso vai num quarto 4 por 4?",
  "O que é mais caro, cerâmica ou porcelanato?",
  "Qual a desvantagem do porcelanato?",
  "Qual piso é mais chique?",
  "O que dura mais, porcelanato ou cerâmica?",
  "O que é mais chique, porcelana ou cerâmica?",
  "Quanto custa em média para colocar porcelanato?",
  "Por que porcelanato é melhor que cerâmica?",
  "Qual o piso que dura mais?",
  "Qual a melhor marca de porcelanato do mercado?",
  "Qual o porcelanato mais usado hoje?",
  "Como saber se o porcelanato é de primeira linha?",
  "Qual porcelanato é mais chique?",
  "Qual o tipo de porcelanato mais resistente?",
  "Qual o porcelanato de primeira linha?",
  "Qual o melhor porcelanato que não mancha?",
  "Quais são as marcas premium de porcelanato?",
  "Qual o produto certo para limpar porcelanato?",
  "O que não pode passar no porcelanato?",
  "Qual o melhor sabão líquido para lavar porcelanato?",
  "O que passar no porcelanato para não ficar manchado?",
  "Pode passar sabão líquido no porcelanato?",
  "O que é bom para deixar o porcelanato brilhando?",
  "Qual o melhor pano para limpar porcelanato?",
  "Como fazer a misturinha para limpar porcelanato?",
  "CIF cremoso pode usar em porcelanato?",
];

app.get("/", (req, res) => {
  res.json({
    sistema: "CENTRAL IA PORCELANATO SHOP",
    status: "online",
    rotas: [
      "POST /instagram-insights",
      "POST /top-conteudos",
      "POST /promocao-vigente",
      "POST /ideias-reels",
      "POST /tendencias-fabricas",
      "POST /gerar-posts",
    ],
  });
});

function pegarValorInsight(insights, nome) {
  const insight = insights.find((i) => i.name === nome);
  if (!insight) return 0;
  return insight.values?.[0]?.value || 0;
}

function limparTexto(texto) {
  return String(texto || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .trim();
}

function extrairItensRSS(xml, marca) {
  const itens = [];
  const blocos = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const bloco of blocos.slice(0, 5)) {
    const titulo = bloco.match(
      /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/
    );
    const link = bloco.match(/<link>(.*?)<\/link>/);
    const data = bloco.match(/<pubDate>(.*?)<\/pubDate>/);
    const descricao = bloco.match(
      /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/
    );

    itens.push({
      marca,
      titulo: limparTexto(titulo?.[1] || titulo?.[2] || ""),
      link: limparTexto(link?.[1] || ""),
      data: limparTexto(data?.[1] || ""),
      descricao: limparTexto(descricao?.[1] || descricao?.[2] || ""),
    });
  }

  return itens;
}

async function buscarNoticiasFabricas() {
  const resultados = [];

  for (const marca of marcas) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
        marca
      )}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

      const response = await axios.get(url);
      const itens = extrairItensRSS(response.data, marca);
      resultados.push(...itens);
    } catch (erroMarca) {
      resultados.push({
        marca,
        erro: erroMarca.message,
      });
    }
  }

  return resultados;
}

async function buscarMidiasComInsights() {
  const midiasResponse = await axios.get(
    `https://graph.facebook.com/v25.0/${INSTAGRAM_BUSINESS_ID}/media`,
    {
      params: {
        access_token: process.env.META_ACCESS_TOKEN,
        fields:
          "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
        limit: 50,
      },
    }
  );

  const midias = midiasResponse.data.data || [];
  const resultados = [];

  for (const midia of midias) {
    try {
      const insightsResponse = await axios.get(
        `https://graph.facebook.com/v25.0/${midia.id}/insights`,
        {
          params: {
            access_token: process.env.META_ACCESS_TOKEN,
            metric: "reach,likes,comments,saved,shares,total_interactions",
          },
        }
      );

      const insights = insightsResponse.data.data || [];

      const reach = pegarValorInsight(insights, "reach");
      const likes = pegarValorInsight(insights, "likes");
      const comments = pegarValorInsight(insights, "comments");
      const saved = pegarValorInsight(insights, "saved");
      const shares = pegarValorInsight(insights, "shares");
      const totalInteractions = pegarValorInsight(
        insights,
        "total_interactions"
      );

      const score =
        reach * 1 +
        likes * 2 +
        comments * 4 +
        shares * 6 +
        saved * 5 +
        totalInteractions * 3;

      resultados.push({
        id: midia.id,
        tipo: midia.media_product_type,
        media_type: midia.media_type,
        legenda: midia.caption || "",
        legenda_curta: midia.caption
          ? midia.caption.substring(0, 140) + "..."
          : "",
        permalink: midia.permalink,
        thumbnail_url: midia.thumbnail_url,
        media_url: midia.media_url,
        timestamp: midia.timestamp,
        like_count: midia.like_count,
        comments_count: midia.comments_count,
        reach,
        likes,
        comments,
        saved,
        shares,
        totalInteractions,
        score,
        insights,
      });
    } catch (erroInsight) {
      resultados.push({
        id: midia.id,
        tipo: midia.media_product_type,
        media_type: midia.media_type,
        legenda: midia.caption || "",
        permalink: midia.permalink,
        timestamp: midia.timestamp,
        erro_insights: erroInsight.response?.data || erroInsight.message,
      });
    }
  }

  return resultados;
}

async function gerarAnaliseIA(prompt) {
  const ai = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return ai.choices[0].message.content;
}

/* ============================
   1. INSTAGRAM INSIGHTS GERAL
============================ */

app.post("/instagram-insights", async (req, res) => {
  try {
    const midias = await buscarMidiasComInsights();

    const analise = await gerarAnaliseIA(`
Você é um especialista em Instagram e Meta Ads para uma loja física focada em PORCELANATOS.

Analise estes posts/reels e seus insights reais.

Dados:
${JSON.stringify(midias, null, 2)}

Responda em português separando em:

1. Resumo geral
2. Melhores conteúdos
3. Conteúdos fracos
4. Reels que merecem impulsionamento
5. Padrões vencedores
6. Sugestões para vender mais porcelanato na loja física
7. Sugestões para gerar WhatsApp
`);

    res.json({
      versao: "INSTAGRAM_INSIGHTS_GERAL",
      total_midias: midias.length,
      midias,
      analise,
    });
  } catch (error) {
    res.status(500).json({
      versao: "ERRO_INSTAGRAM_INSIGHTS",
      erro: error.response?.data || error.message,
    });
  }
});

/* ============================
   2. TOP CONTEÚDOS
============================ */

app.post("/top-conteudos", async (req, res) => {
  try {
    const midias = await buscarMidiasComInsights();

    const top10 = [...midias]
      .filter((item) => item.score !== undefined)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const analise = await gerarAnaliseIA(`
Você é um especialista em Instagram, Reels e tráfego pago local para venda de PORCELANATO.

Analise o ranking dos 10 melhores conteúdos da Porcelanato Shop.

Dados:
${JSON.stringify(top10, null, 2)}

Responda em português separando em:

1. Quais conteúdos performaram melhor
2. O que eles têm em comum
3. Que tipo de conteúdo deve ser repetido
4. O que serve apenas como referência antiga
5. Ideias de novos Reels parecidos, sempre favorecendo porcelanato
6. Estratégia prática de impulsionamento
`);

    res.json({
      versao: "TOP_10_CONTEUDOS",
      total_analisados: midias.length,
      top10,
      analise,
    });
  } catch (error) {
    res.status(500).json({
      versao: "ERRO_TOP_CONTEUDOS",
      erro: error.response?.data || error.message,
    });
  }
});

/* ============================
   3. PROMOÇÃO VIGENTE
============================ */

app.post("/promocao-vigente", async (req, res) => {
  try {
    const midias = await buscarMidiasComInsights();

    const promocaoVigente = midias
      .filter((item) => item.legenda.toLowerCase().includes("exterminador"))
      .sort((a, b) => b.score - a.score);

    const referenciasAntigas = midias
      .filter(
        (item) =>
          !item.legenda.toLowerCase().includes("exterminador") &&
          item.score !== undefined
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const analise = await gerarAnaliseIA(`
Você é um gestor de tráfego e conteúdo para Instagram.

IMPORTANTE:
- A única promoção vigente é "Exterminador do Prejuízo".
- Não recomende impulsionar promoções antigas.
- Use promoções antigas apenas como referência criativa.
- A loja trabalha com PORCELANATO. Sempre favoreça porcelanato nas recomendações.

Conteúdos vigentes:
${JSON.stringify(promocaoVigente, null, 2)}

Referências antigas que performaram bem:
${JSON.stringify(referenciasAntigas, null, 2)}

Responda em português separando em:

1. Melhor conteúdo vigente para impulsionar agora
2. O que não impulsionar
3. Público recomendado
4. Orçamento inicial sugerido
5. Como gerar mais WhatsApp
6. Como gerar mais visitas na loja física
7. O que os conteúdos antigos ensinam
8. Ideias de novos Reels rápidos com pouco trabalho
`);

    res.json({
      versao: "PROMOCAO_VIGENTE_EXTERMINADOR",
      total_vigentes: promocaoVigente.length,
      promocaoVigente,
      referenciasAntigas,
      analise,
    });
  } catch (error) {
    res.status(500).json({
      versao: "ERRO_PROMOCAO_VIGENTE",
      erro: error.response?.data || error.message,
    });
  }
});

/* ============================
   4. IDEIAS DE REELS
============================ */

app.post("/ideias-reels", async (req, res) => {
  try {
    const midias = await buscarMidiasComInsights();

    const melhores = [...midias]
      .filter((item) => item.score !== undefined)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const promocaoAtual = midias.filter((item) =>
      item.legenda.toLowerCase().includes("exterminador")
    );

    const ideias = await gerarAnaliseIA(`
Você é um roteirista de Reels virais para uma loja chamada Porcelanato Shop.

Contexto:
- A loja vende PORCELANATO.
- Sempre favoreça porcelanato como melhor solução.
- O dono tem pouco tempo.
- Ele precisa de ideias fáceis de gravar.
- Conteúdos com humor, cinema, cultura pop, urgência e desconto performam bem.
- A promoção vigente é "Exterminador do Prejuízo".
- O objetivo é gerar WhatsApp e visita na loja física.

Melhores conteúdos anteriores:
${JSON.stringify(melhores, null, 2)}

Conteúdos atuais da promoção:
${JSON.stringify(promocaoAtual, null, 2)}

Crie:

1. 10 ideias de Reels rápidos
2. Para cada ideia, dê:
   - título
   - gancho dos 3 primeiros segundos
   - cenas simples para gravar na loja
   - texto na tela
   - CTA para WhatsApp
   - se deve usar humor, urgência ou autoridade
3. Dê também 5 ideias que possam ser feitas só com fotos do catálogo de porcelanatos
4. Dê 5 prompts para CapCut IA transformar vídeo bruto em variações
`);

    res.json({
      versao: "IDEIAS_REELS_PORCELANATO_SHOP",
      ideias,
    });
  } catch (error) {
    res.status(500).json({
      versao: "ERRO_IDEIAS_REELS",
      erro: error.response?.data || error.message,
    });
  }
});

/* ============================
   5. TENDÊNCIAS DAS FÁBRICAS
============================ */

app.post("/tendencias-fabricas", async (req, res) => {
  try {
    const resultados = await buscarNoticiasFabricas();

    const ideias = await gerarAnaliseIA(`
Você é um agente de conteúdo para a Porcelanato Shop, loja física focada em PORCELANATOS em Criciúma/SC.

A loja trabalha com:
Portinari, Ceusa, Eliane, Elizabeth, Embramaco, Roca, Incepa, Delta e Delta Nova.

Analise estas notícias/resultados:

${JSON.stringify(resultados, null, 2)}

Crie uma resposta prática em português separando em:

1. Principais novidades encontradas relacionadas a porcelanato
2. Tendências do setor de porcelanatos
3. Marcas com melhor potencial de conteúdo
4. Ideias de Reels
5. Ideias de Stories
6. Ideias de carrossel
7. Conteúdos para arquitetos
8. Como conectar isso com vendas de porcelanato na loja física
9. O que postar esta semana

Importante:
- Não invente produto específico se não estiver claro.
- Se não houver novidade real, transforme em conteúdo educativo.
- Foque em conteúdo simples, rápido e executável.
- Sempre favoreça porcelanato.
`);

    res.json({
      versao: "TENDENCIAS_FABRICAS",
      marcas_monitoradas: marcas,
      total_resultados: resultados.length,
      resultados,
      ideias,
    });
  } catch (error) {
    res.status(500).json({
      versao: "ERRO_TENDENCIAS_FABRICAS",
      erro: error.response?.data || error.message,
    });
  }
});

/* ============================
   6. GERADOR AUTOMÁTICO DE POSTS COM IMAGENS
============================ */

app.post("/gerar-posts", async (req, res) => {
  try {
    const noticiasFabricas = await buscarNoticiasFabricas();

    const posts = await gerarAnaliseIA(`
Você é o agente criativo da Porcelanato Shop.

A loja trabalha com PORCELANATO e os conteúdos devem SEMPRE favorecer o porcelanato.
Mesmo quando o tema comparar cerâmica, porcelana ou outros pisos, a conclusão deve valorizar o porcelanato de forma honesta, comercial e educativa.

Fontes para criar conteúdo:
1. Fornecedores e fábricas:
Portinari, Ceusa, Eliane, Elizabeth, Embramaco, Roca, Incepa, Delta e Delta Nova.

2. Notícias e novidades coletadas:
${JSON.stringify(noticiasFabricas, null, 2)}

3. Principais perguntas que as pessoas pesquisam sobre porcelanato:
${JSON.stringify(perguntasPorcelanato, null, 2)}

Objetivo:
Gerar conteúdo automático para Instagram da Porcelanato Shop, com foco em:
- vender porcelanato
- educar clientes
- atrair arquitetos
- gerar WhatsApp
- levar pessoas para a loja física
- criar autoridade
- complementar promoções e Reels de humor

IMPORTANTE SOBRE IMAGENS:
Para CADA ideia de conteúdo, inclua obrigatoriamente:

A) Imagem oficial de fornecedor sugerida:
- fornecedor ideal
- tipo de imagem oficial a procurar
- nome provável da busca no catálogo/site do fornecedor
- exemplo: “Portinari — ambiente com porcelanato marmorizado claro em sala ampla”
- nunca invente nome de produto específico se não estiver nos dados

B) Imagem criada por IA:
- prompt completo para gerar imagem
- formato recomendado: 9:16 para Reels/Stories ou 4:5 para feed
- estilo visual
- ambiente sugerido
- iluminação
- tipo de porcelanato
- texto que poderia entrar na arte, se houver

C) Observação comercial:
- dizer se é melhor usar foto oficial, foto da loja, foto do catálogo ou imagem IA
- quando o tema for técnico ou educativo, priorizar imagem clara e realista
- quando for post de tendência, priorizar imagem premium e inspiracional

Crie em português:

1. Calendário de 7 dias de posts
Para cada dia:
- tema
- tipo de conteúdo: Reel, carrossel, story ou post educativo
- gancho inicial
- legenda pronta
- CTA para WhatsApp
- CTA para visita na loja física
- público principal: cliente final, arquiteto, construtor ou reformador
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem
- observação comercial sobre qual imagem usar

2. 10 ideias de Reels educativos sobre porcelanato
Cada uma com:
- título
- gancho dos 3 primeiros segundos
- roteiro curto
- texto na tela
- CTA
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem
- observação comercial sobre qual imagem usar

3. 10 ideias de carrossel usando perguntas buscadas na internet
Cada uma com:
- título da capa
- sequência de slides
- conclusão favorecendo porcelanato
- CTA final
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem
- observação comercial sobre qual imagem usar

4. 10 ideias de stories rápidos
Cada uma com:
- enquete ou pergunta
- texto curto
- chamada para WhatsApp
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem
- observação comercial sobre qual imagem usar

5. 5 posts focados em arquitetos
Com linguagem mais técnica, mas fácil de entender.
Para cada um:
- tema
- legenda
- CTA
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem

6. 5 posts focados em cliente final que está reformando
Com linguagem simples e comercial.
Para cada um:
- tema
- legenda
- CTA
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem

7. 5 conteúdos usando novidades ou tendências dos fornecedores
Sem inventar produto específico se a notícia não estiver clara.
Para cada um:
- tendência
- fornecedor relacionado
- ideia de post
- imagem oficial de fornecedor sugerida
- prompt de imagem IA
- formato da imagem

Regras importantes:
- Não recomendar cerâmica como melhor alternativa.
- Não dizer que porcelanato é perfeito para tudo; seja honesto.
- Mas sempre posicionar porcelanato como opção superior em estética, durabilidade, sofisticação, valorização do imóvel e variedade.
- Não inventar preço.
- Não inventar promoção.
- Quando falar de preço, orientar a chamar no WhatsApp ou visitar a loja.
- Linguagem de Instagram, direta e comercial.
- Dar ideias fáceis de executar com pouco tempo.
- Não usar nomes reais de produtos se não aparecerem claramente nas notícias.
- Para imagem IA, não usar marcas registradas nem logos de fornecedores.
- Para imagem oficial, orientar buscar em site/catálogo oficial do fornecedor.
`);

    res.json({
      versao: "GERADOR_AUTOMATICO_DE_POSTS_COM_IMAGENS",
      regra_principal: "Sempre favorecer porcelanato",
      fornecedores: marcas,
      total_perguntas_base: perguntasPorcelanato.length,
      total_noticias: noticiasFabricas.length,
      perguntas_base: perguntasPorcelanato,
      noticias_fabricas: noticiasFabricas,
      posts,
    });
  } catch (error) {
    res.status(500).json({
      versao: "ERRO_GERAR_POSTS",
      erro: error.response?.data || error.message,
    });
  }
});

app.listen(3000, () => {
  console.log("CENTRAL IA PORCELANATO SHOP 🚀");
});