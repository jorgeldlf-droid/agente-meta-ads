import React, { useMemo, useState } from "react";

const API_BASE = "http://localhost:3001";

const rotas = [
  {
    id: "promocao",
    titulo: "Promoção Vigente",
    subtitulo: "Exterminador do Prejuízo",
    endpoint: "/promocao-vigente",
  },
  {
    id: "top",
    titulo: "Top Conteúdos",
    subtitulo: "Ranking dos melhores posts e reels",
    endpoint: "/top-conteudos",
  },
  {
    id: "insights",
    titulo: "Instagram Insights",
    subtitulo: "Alcance, interações e desempenho",
    endpoint: "/instagram-insights",
  },
  {
    id: "ideias",
    titulo: "Ideias de Reels",
    subtitulo: "Roteiros rápidos com IA",
    endpoint: "/ideias-reels",
  },
  {
    id: "gerar-posts",
    titulo: "Gerar Posts",
    subtitulo: "Posts automáticos com IA",
    endpoint: "/gerar-posts",
  },
  {
    id: "tendencias",
    titulo: "Tendências das Fábricas",
    subtitulo: "Novidades dos fornecedores",
    endpoint: "/tendencias-fabricas",
  },
];

function numero(valor) {
  if (!valor) return "0";
  return Number(valor).toLocaleString("pt-BR");
}

function limparTexto(texto) {
  return String(texto || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/^[-•]\s*/, "")
    .trim();
}

function extrairAnalise(data) {
  return data?.analise || data?.analiseIA || data?.analise_ia || data?.ideias || "";
}

function isImagemOficialReal(url) {
  if (!url) return false;

  const lower = String(url).toLowerCase();

  if (lower.includes("unsplash.com")) return false;
  if (lower.includes("pexels.com")) return false;
  if (lower.includes("pixabay.com")) return false;

  return (
    lower.includes("portinari") ||
    lower.includes("ceusa") ||
    lower.includes("eliane") ||
    lower.includes("elizabeth") ||
    lower.includes("embramaco") ||
    lower.includes("roca") ||
    lower.includes("incepa") ||
    lower.includes("delta")
  );
}

function resumoMetricas(data, posts) {
  const fonte = data?.promocaoVigente || data?.top10 || data?.midias || [];
  const lista = Array.isArray(fonte) ? fonte : [];

  const alcance = lista.reduce((acc, item) => acc + (item.reach || 0), 0);
  const interacoes = lista.reduce((acc, item) => acc + (item.totalInteractions || 0), 0);
  const compartilhamentos = lista.reduce((acc, item) => acc + (item.shares || 0), 0);

  return {
    total: posts?.length || lista.length || 0,
    alcance,
    interacoes,
    compartilhamentos,
  };
}

function detectarTipoLinha(linha) {
  const texto = limparTexto(linha);
  const lower = texto.toLowerCase();

  if (!texto) return "space";

  if (texto.startsWith("#") || /^\d+\./.test(texto) || /^dia\s+\d+/i.test(texto)) {
    return "title";
  }

  if (
    lower.includes("imagem oficial") ||
    lower.includes("imagem de fornecedor") ||
    lower.includes("foto oficial")
  ) {
    return "officialImage";
  }

  if (
    lower.includes("prompt ia") ||
    lower.includes("prompt de imagem") ||
    lower.includes("prompt imagem ia")
  ) {
    return "aiImage";
  }

  if (
    lower.includes("legenda") ||
    lower.includes("cta") ||
    lower.includes("gancho") ||
    lower.includes("tema") ||
    lower.includes("tipo") ||
    lower.includes("público") ||
    lower.includes("publico")
  ) {
    return "detail";
  }

  return "paragraph";
}

function LinhaAnalise({ linha }) {
  const tipo = detectarTipoLinha(linha);
  const texto = limparTexto(linha).replaceAll("#", "").trim();

  if (tipo === "space") return <div style={styles.analysisSpace} />;

  if (tipo === "title") {
    return <h3 style={styles.analysisTitle}>{texto}</h3>;
  }

  if (tipo === "officialImage") {
    return (
      <div style={styles.imageSuggestionCard}>
        <div style={styles.cardMiniTag}>IMAGEM OFICIAL SUGERIDA</div>
        <p style={styles.imageSuggestionText}>{texto}</p>
      </div>
    );
  }

  if (tipo === "aiImage") {
    return (
      <div style={styles.aiSuggestionCard}>
        <div style={styles.cardMiniTagDark}>PROMPT PARA IMAGEM IA</div>
        <p style={styles.imageSuggestionText}>{texto}</p>
      </div>
    );
  }

  if (tipo === "detail") {
    return <p style={styles.analysisBullet}>{texto}</p>;
  }

  return <p style={styles.analysisParagraph}>{texto}</p>;
}

function formatarAnalise(texto) {
  if (!texto) return null;

  return texto.split("\n").map((linha, index) => (
    <LinhaAnalise key={index} linha={linha} />
  ));
}

function PostCard({ post, index, onGerarImagem, gerando }) {
  const [copiado, setCopiado] = useState(false);

  const prompt =
    post.promptImagem ||
    post.prompt_ia ||
    post.promptIA ||
    post.prompt ||
    `${post.tema || ""}. ${post.gancho || ""}. ${post.legenda || ""}`;

  const imagemOficialReal = isImagemOficialReal(post.imagemOficial);

  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      alert("Não consegui copiar o prompt.");
    }
  }

  return (
    <div style={styles.postCard}>
      <h3 style={styles.postDay}>DIA {index + 1}</h3>

      <div style={styles.postInfo}>
        <p><strong>Tema:</strong> {post.tema || "-"}</p>
        <p><strong>Gancho:</strong> {post.gancho || "-"}</p>
        <p><strong>Legenda:</strong> {post.legenda || "-"}</p>
        <p><strong>CTA:</strong> {post.cta || "-"}</p>
        <p><strong>Fornecedor:</strong> {post.fornecedor || post.fornecedorDetectado || "Não identificado"}</p>
      </div>

      {imagemOficialReal ? (
        <div style={styles.realOfficialBox}>
          <div style={styles.cardMiniTag}>IMAGEM OFICIAL DO FORNECEDOR</div>
          <img src={post.imagemOficial} alt="Imagem oficial" style={styles.officialImage} />
        </div>
      ) : (
        <div style={styles.noOfficialBox}>
          <div style={styles.noOfficialTitle}>Imagem oficial não encontrada</div>
          <p style={styles.noOfficialText}>
            Não vamos mostrar imagem genérica como oficial. Use IA ou adicione futuramente uma imagem real do catálogo.
          </p>
        </div>
      )}

      <div style={styles.aiPostBox}>
        <div style={styles.aiPostHeader}>
          <div>
            <div style={styles.cardMiniTagDark}>IMAGEM IA</div>
            <p style={styles.aiPostText}>Gerar imagem premium baseada neste post.</p>
          </div>

          <div style={styles.buttonGroup}>
            <button onClick={copiarPrompt} style={styles.copyButton}>
              {copiado ? "Copiado!" : "Copiar Prompt"}
            </button>

            <button
              onClick={() => onGerarImagem(index, prompt)}
              style={styles.generateButton}
              disabled={gerando}
            >
              {gerando ? "Gerando..." : "Gerar Imagem IA"}
            </button>
          </div>
        </div>

        {gerando && (
          <div style={styles.loadingImageBox}>
            <div style={styles.spinner}></div>
            <strong>Gerando imagem IA...</strong>
            <small>Aguarde alguns segundos.</small>
          </div>
        )}

        {post.imagemIA && !gerando && (
          <div style={styles.generatedImageBox}>
            <img src={post.imagemIA} alt="Imagem IA gerada" style={styles.generatedImage} />

            <div style={styles.imageActions}>
              <a href={post.imagemIA} target="_blank" rel="noreferrer" style={styles.openImageButton}>
                Abrir imagem
              </a>

              <a href={post.imagemIA} download="imagem-ia-porcelanato.png" style={styles.downloadButton}>
                Baixar imagem
              </a>
            </div>

            <small style={styles.imageWarning}>Imagem gerada por IA OpenAI. Revise antes de publicar.</small>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [selecionada, setSelecionada] = useState(rotas[4]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [gerandoImagem, setGerandoImagem] = useState({});

  const analise = useMemo(() => extrairAnalise(data), [data]);
  const metricas = useMemo(() => resumoMetricas(data, posts), [data, posts]);

  async function chamarRota(rota) {
    setSelecionada(rota);
    setLoading(true);
    setErro("");
    setData(null);

    if (rota.id === "gerar-posts") {
      setPosts([]);
    }

    try {
      const resposta = await fetch(`${API_BASE}${rota.endpoint}`, {
        method: rota.id === "gerar-posts" ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await resposta.json();

      if (!resposta.ok) {
        throw new Error(JSON.stringify(json, null, 2));
      }

      setData(json);

      if (rota.id === "gerar-posts") {
        const lista = Array.isArray(json) ? json : json.posts || [];
        setPosts(lista);
      }
    } catch (e) {
      setErro(e.message || "Erro ao conectar com o servidor local.");
    } finally {
      setLoading(false);
    }
  }

  async function gerarImagemIA(index, prompt) {
    try {
      setGerandoImagem((prev) => ({ ...prev, [index]: true }));

      const resposta = await fetch(`${API_BASE}/gerar-imagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const json = await resposta.json();

      if (!resposta.ok || !json.imageUrl) {
        throw new Error(json.error || "Erro ao gerar imagem IA.");
      }

      setPosts((prev) =>
        prev.map((post, i) =>
          i === index ? { ...post, imagemIA: json.imageUrl } : post
        )
      );
    } catch (e) {
      alert(e.message || "Erro ao gerar imagem IA.");
    } finally {
      setGerandoImagem((prev) => ({ ...prev, [index]: false }));
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.logoBox}>
            <img src="/logo-porcelanato-shop.png" alt="Porcelanato Shop" style={styles.logo} />
          </div>

          <div style={styles.headerInfo}>
            <span style={styles.systemTag}>CENTRAL INTERNA DE MARKETING</span>
            <h1 style={styles.title}>Painel IA Porcelanato Shop</h1>
            <p style={styles.subtitle}>
              Insights, ideias de conteúdo, tendências, imagens sugeridas e decisões de marketing em um só lugar.
            </p>
          </div>
        </header>

        <div style={styles.layout}>
          <aside style={styles.sidebar}>
            <div style={styles.sidebarTitle}>Módulos do agente</div>

            {rotas.map((rota) => {
              const ativo = selecionada.id === rota.id;

              return (
                <button
                  key={rota.id}
                  onClick={() => chamarRota(rota)}
                  style={{
                    ...styles.menuButton,
                    ...(ativo ? styles.menuButtonActive : {}),
                  }}
                >
                  <span style={styles.menuTitle}>{rota.titulo}</span>
                  <span style={styles.menuSubtitle}>{rota.subtitulo}</span>
                </button>
              );
            })}
          </aside>

          <main style={styles.main}>
            <section style={styles.statsGrid}>
              <div style={styles.statCard}>
                <span style={styles.statLabel}>Conteúdos</span>
                <strong style={styles.statNumber}>{numero(metricas.total)}</strong>
                <small style={styles.statText}>analisados</small>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Alcance</span>
                <strong style={styles.statNumber}>{numero(metricas.alcance)}</strong>
                <small style={styles.statText}>somado</small>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Interações</span>
                <strong style={styles.statNumber}>{numero(metricas.interacoes)}</strong>
                <small style={styles.statText}>somadas</small>
              </div>

              <div style={styles.statCard}>
                <span style={styles.statLabel}>Shares</span>
                <strong style={styles.statNumber}>{numero(metricas.compartilhamentos)}</strong>
                <small style={styles.statText}>compartilhamentos</small>
              </div>
            </section>

            <section style={styles.panel}>
              <div style={styles.panelHeader}>
                <div style={{ minWidth: 0 }}>
                  <span style={styles.sectionTag}>ANÁLISE ATUAL</span>
                  <h2 style={styles.panelTitle}>{selecionada.titulo}</h2>
                  <p style={styles.panelSubtitle}>{selecionada.subtitulo}</p>
                </div>

                <button
                  onClick={() => chamarRota(selecionada)}
                  disabled={loading}
                  style={{
                    ...styles.primaryButton,
                    ...(loading ? styles.disabledButton : {}),
                  }}
                >
                  {loading ? "Analisando..." : "Atualizar análise"}
                </button>
              </div>

              {!data && posts.length === 0 && !loading && !erro && (
                <div style={styles.emptyBox}>
                  <h3>Selecione um módulo para iniciar</h3>
                  <p>O painel vai buscar dados reais do agente e organizar a resposta aqui.</p>
                </div>
              )}

              {loading && (
                <div style={styles.emptyBox}>
                  <h3>Buscando dados e gerando análise...</h3>
                  <p>Isso pode levar alguns segundos, principalmente nas rotas com IA.</p>
                </div>
              )}

              {erro && (
                <div style={styles.errorBox}>
                  <strong>Erro de conexão ou servidor:</strong>
                  <pre>{erro}</pre>
                </div>
              )}

              {posts.length > 0 && !loading && (
                <div style={styles.postsGrid}>
                  {posts.map((post, index) => (
                    <PostCard
                      key={index}
                      post={post}
                      index={index}
                      onGerarImagem={gerarImagemIA}
                      gerando={!!gerandoImagem[index]}
                    />
                  ))}
                </div>
              )}

              {analise && posts.length === 0 && (
                <div style={styles.analysisBox}>{formatarAnalise(analise)}</div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    background: "#858989",
    color: "#ffffff",
    fontFamily: "'Segoe UI', Inter, Arial, Helvetica, sans-serif",
    padding: 26,
    boxSizing: "border-box",
    overflowX: "hidden",
  },

  shell: {
    maxWidth: 1320,
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  },

  header: {
    width: "100%",
    background: "#6f7373",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 26,
    padding: 26,
    display: "flex",
    alignItems: "center",
    gap: 28,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  logoBox: {
    background: "#858989",
    borderRadius: 22,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    width: 260,
    minWidth: 260,
    display: "flex",
    justifyContent: "center",
    boxSizing: "border-box",
  },

  logo: {
    width: 230,
    maxWidth: "100%",
    display: "block",
  },

  headerInfo: {
    flex: 1,
    minWidth: 0,
  },

  systemTag: {
    color: "#ff6b1a",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 2,
  },

  title: {
    margin: "8px 0 8px",
    fontSize: 42,
    lineHeight: 1,
    fontWeight: 900,
    color: "#ffffff",
  },

  subtitle: {
    margin: 0,
    maxWidth: 760,
    fontSize: 16,
    lineHeight: 1.55,
    color: "rgba(255,255,255,0.78)",
  },

  layout: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "310px minmax(0, 1fr)",
    gap: 22,
    marginTop: 24,
    boxSizing: "border-box",
  },

  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },

  sidebarTitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },

  menuButton: {
    width: "100%",
    background: "#737777",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 18,
    padding: "16px 18px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
    transition: "all 0.2s ease",
    boxSizing: "border-box",
  },

  menuButtonActive: {
    background: "#ff6b1a",
    borderColor: "#ff6b1a",
    color: "#ffffff",
    transform: "translateX(4px)",
  },

  menuTitle: {
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 0.2,
  },

  menuSubtitle: {
    fontSize: 12,
    lineHeight: 1.35,
    color: "rgba(255,255,255,0.78)",
    maxWidth: 230,
  },

  main: {
    display: "flex",
    flexDirection: "column",
    gap: 22,
    minWidth: 0,
    width: "100%",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
    width: "100%",
  },

  statCard: {
    background: "#6f7373",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 22,
    padding: 20,
    minHeight: 118,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 16px 35px rgba(0,0,0,0.15)",
    boxSizing: "border-box",
    minWidth: 0,
  },

  statLabel: {
    color: "#ff8a3d",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },

  statNumber: {
    fontSize: 32,
    fontWeight: 900,
    color: "#ffffff",
    wordBreak: "break-word",
  },

  statText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
  },

  panel: {
    background: "#f7f7f7",
    color: "#202020",
    borderRadius: 26,
    padding: 26,
    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.2)",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    marginBottom: 20,
    width: "100%",
    boxSizing: "border-box",
  },

  sectionTag: {
    color: "#ff6b1a",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },

  panelTitle: {
    margin: "6px 0 4px",
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#1f1f1f",
  },

  panelSubtitle: {
    margin: 0,
    color: "#666666",
    fontSize: 15,
  },

  primaryButton: {
    background: "#ff6b1a",
    color: "#ffffff",
    border: "none",
    borderRadius: 14,
    padding: "13px 20px",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 14,
    boxShadow: "0 10px 25px rgba(255,107,26,0.35)",
    whiteSpace: "nowrap",
    maxWidth: 220,
  },

  disabledButton: {
    opacity: 0.65,
    cursor: "not-allowed",
  },

  emptyBox: {
    background: "#ffffff",
    border: "1px dashed #cccccc",
    borderRadius: 20,
    padding: 34,
    textAlign: "center",
    color: "#333333",
  },

  errorBox: {
    background: "#fff0f0",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: 18,
    padding: 18,
    maxWidth: "100%",
    overflowX: "auto",
  },

  analysisBox: {
    background: "#ffffff",
    border: "1px solid #e3e3e3",
    borderRadius: 20,
    padding: 24,
    color: "#262626",
    lineHeight: 1.65,
    maxWidth: "100%",
    overflowWrap: "break-word",
    wordBreak: "break-word",
    boxSizing: "border-box",
  },

  postsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 22,
  },

  postCard: {
    background: "#ffffff",
    border: "1px solid #e5e5e5",
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
  },

  postDay: {
    color: "#ff6b1a",
    textAlign: "center",
    fontSize: 24,
    margin: "0 0 18px",
    fontWeight: 900,
  },

  postInfo: {
    color: "#2d2d2d",
    fontSize: 15,
    lineHeight: 1.55,
  },

  realOfficialBox: {
    marginTop: 18,
    background: "#fff7f2",
    border: "1px solid #ffd2ba",
    borderRadius: 18,
    padding: 16,
  },

  officialImage: {
    width: "100%",
    borderRadius: 16,
    maxHeight: 520,
    objectFit: "cover",
    display: "block",
  },

  noOfficialBox: {
    marginTop: 18,
    background: "#fff7f2",
    border: "1px solid #ffd2ba",
    borderLeft: "6px solid #ff6b1a",
    borderRadius: 16,
    padding: 16,
  },

  noOfficialTitle: {
    color: "#ff6b1a",
    fontWeight: 900,
    marginBottom: 6,
  },

  noOfficialText: {
    margin: 0,
    color: "#555",
    lineHeight: 1.5,
  },

  aiPostBox: {
    marginTop: 18,
    background: "#eeeeee",
    border: "1px solid #d9d9d9",
    borderLeft: "6px solid #252525",
    borderRadius: 16,
    padding: 16,
  },

  aiPostHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  aiPostText: {
    margin: "8px 0 0",
    color: "#555",
    fontSize: 14,
  },

  analysisSpace: {
    height: 8,
  },

  analysisTitle: {
    color: "#ff6b1a",
    fontSize: 22,
    fontWeight: 900,
    margin: "30px 0 14px",
    borderTop: "1px solid #eeeeee",
    paddingTop: 20,
    textAlign: "center",
  },

  analysisParagraph: {
    fontSize: 15,
    margin: "8px 0",
    color: "#2f2f2f",
    overflowWrap: "break-word",
  },

  analysisBullet: {
    background: "#f4f4f4",
    borderLeft: "4px solid #ff6b1a",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 15,
    color: "#333333",
    margin: "8px 0",
    overflowWrap: "break-word",
  },

  imageSuggestionCard: {
    background: "#fff7f2",
    border: "1px solid #ffd2ba",
    borderLeft: "6px solid #ff6b1a",
    borderRadius: 16,
    padding: 16,
    margin: "12px 0",
    boxShadow: "0 8px 20px rgba(255,107,26,0.08)",
  },

  aiSuggestionCard: {
    background: "#eeeeee",
    border: "1px solid #d9d9d9",
    borderLeft: "6px solid #252525",
    borderRadius: 16,
    padding: 16,
    margin: "12px 0",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
  },

  cardMiniTag: {
    display: "inline-block",
    background: "#ff6b1a",
    color: "#ffffff",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    marginBottom: 8,
  },

  cardMiniTagDark: {
    display: "inline-block",
    background: "#252525",
    color: "#ffffff",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
  },

  imageSuggestionText: {
    margin: 0,
    color: "#2b2b2b",
    fontSize: 15,
    lineHeight: 1.6,
  },

  buttonGroup: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  copyButton: {
    background: "#ff6b1a",
    color: "#ffffff",
    border: "none",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(255,107,26,0.25)",
  },

  generateButton: {
    background: "#252525",
    color: "#ffffff",
    border: "none",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
  },

  generatedImageBox: {
    marginTop: 16,
    background: "#ffffff",
    border: "1px solid #d7d7d7",
    borderRadius: 18,
    padding: 12,
  },

  generatedImage: {
    width: "100%",
    maxWidth: 520,
    display: "block",
    borderRadius: 16,
    margin: "0 auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
  },

  loadingImageBox: {
    marginTop: 16,
    minHeight: 180,
    background: "#f4f4f4",
    border: "1px dashed #cfcfcf",
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 8,
    color: "#333333",
    textAlign: "center",
    padding: 18,
  },

  spinner: {
    width: 34,
    height: 34,
    border: "4px solid #dddddd",
    borderTop: "4px solid #ff6b1a",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },

  imageActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 12,
  },

  openImageButton: {
    background: "#ff6b1a",
    color: "#ffffff",
    padding: "9px 14px",
    borderRadius: 999,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 900,
  },

  downloadButton: {
    background: "#252525",
    color: "#ffffff",
    padding: "9px 14px",
    borderRadius: 999,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 900,
  },

  imageWarning: {
    display: "block",
    textAlign: "center",
    color: "#666666",
    marginTop: 10,
  },
};