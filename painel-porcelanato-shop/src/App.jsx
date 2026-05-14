import React, { useMemo, useState } from "react";

const API_BASE = "http://localhost:3000";

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
  subtitulo: "Posts automáticos com dúvidas + fornecedores",
  endpoint: "/gerar-posts",
},
  {
    id: "tendencias",
    titulo: "Tendências das Fábricas",
    subtitulo: "Novidades dos fornecedores",
    endpoint: "/tendencias-fabricas",
  },
];

function extrairAnalise(data) {
  return data?.analise || data?.analiseIA || data?.analise_ia || data?.ideias || data?.posts || "";
}

function numero(valor) {
  if (valor === undefined || valor === null || Number.isNaN(Number(valor))) return "0";
  return Number(valor).toLocaleString("pt-BR");
}

function textoCurto(texto, tamanho = 150) {
  if (!texto) return "Sem legenda";
  return texto.length > tamanho ? texto.slice(0, tamanho) + "..." : texto;
}

function resumoMetricas(data) {
  const fonte = data?.promocaoVigente || data?.top10 || data?.midias || [];
  const lista = Array.isArray(fonte) ? fonte : [];

  const melhor = [...lista].sort((a, b) => (b.score || 0) - (a.score || 0))[0];

  const alcance = lista.reduce((acc, item) => acc + (item.reach || 0), 0);
  const interacoes = lista.reduce((acc, item) => acc + (item.totalInteractions || 0), 0);
  const compartilhamentos = lista.reduce((acc, item) => acc + (item.shares || 0), 0);

  return {
    total: lista.length,
    melhor,
    alcance,
    interacoes,
    compartilhamentos,
  };
}

function limparMarkdownBasico(texto) {
  return String(texto || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();
}

function formatarAnalise(texto) {
  if (!texto) return null;

  return texto
    .split("\n")
    .map((linha, index) => {
      const limpa = limparMarkdownBasico(linha);

      if (!limpa) return <div key={index} style={styles.analysisSpace} />;

      if (
        limpa.startsWith("#") ||
        /^\d+\./.test(limpa) ||
        limpa.startsWith("##")
      ) {
        return (
          <h3 key={index} style={styles.analysisTitle}>
            {limpa.replaceAll("#", "").trim()}
          </h3>
        );
      }

      if (limpa.startsWith("-") || limpa.startsWith("•")) {
        return (
          <p key={index} style={styles.analysisBullet}>
            {limpa}
          </p>
        );
      }

      return (
        <p key={index} style={styles.analysisParagraph}>
          {limpa}
        </p>
      );
    });
}

function ConteudoCard({ item, index }) {
  const tipo = item.tipo || item.media_product_type || item.media_type || "Conteúdo";

  return (
    <div style={styles.contentCard}>
      <div style={styles.contentTop}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.rank}>#{index + 1}</div>
          <h3 style={styles.contentTitle}>{textoCurto(item.legenda_curta || item.legenda, 130)}</h3>
        </div>

        <div style={styles.scoreBox}>
          <span>Score</span>
          <strong>{numero(item.score)}</strong>
        </div>
      </div>

      <div style={styles.typeBadge}>{tipo}</div>

      <div style={styles.miniGrid}>
        <div style={styles.miniMetric}>
          <strong>{numero(item.reach)}</strong>
          <span>Alcance</span>
        </div>

        <div style={styles.miniMetric}>
          <strong>{numero(item.totalInteractions)}</strong>
          <span>Interações</span>
        </div>

        <div style={styles.miniMetric}>
          <strong>{numero(item.shares)}</strong>
          <span>Shares</span>
        </div>
      </div>

      {item.permalink && (
        <a href={item.permalink} target="_blank" rel="noreferrer" style={styles.linkButton}>
          Abrir no Instagram
        </a>
      )}
    </div>
  );
}

export default function App() {
  const [selecionada, setSelecionada] = useState(rotas[0]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [data, setData] = useState(null);

  const analise = useMemo(() => extrairAnalise(data), [data]);
  const metricas = useMemo(() => resumoMetricas(data), [data]);

  const listaConteudos = useMemo(() => {
    if (!data) return [];
    return data.promocaoVigente || data.top10 || data.midias || [];
  }, [data]);

  async function chamarRota(rota) {
    setSelecionada(rota);
    setLoading(true);
    setErro("");
    setData(null);

    try {
      const resposta = await fetch(`${API_BASE}${rota.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await resposta.json();

      if (!resposta.ok) {
        throw new Error(JSON.stringify(json, null, 2));
      }

      setData(json);
    } catch (e) {
      setErro(e.message || "Erro ao conectar com o servidor local.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.logoBox}>
            <img
              src="/logo-porcelanato-shop.png"
              alt="Porcelanato Shop"
              style={styles.logo}
            />
          </div>

          <div style={styles.headerInfo}>
            <span style={styles.systemTag}>CENTRAL INTERNA DE MARKETING</span>
            <h1 style={styles.title}>Painel IA Porcelanato Shop</h1>
            <p style={styles.subtitle}>
              Insights, ideias de conteúdo, tendências e decisões de impulsionamento em um só lugar.
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

              {!data && !loading && !erro && (
                <div style={styles.emptyBox}>
                  <h3>Selecione um módulo para iniciar</h3>
                  <p>
                    O painel vai buscar dados reais do agente e organizar a resposta aqui de forma mais clara.
                  </p>
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

              {analise && (
                <div style={styles.analysisBox}>
                  {formatarAnalise(analise)}
                </div>
              )}
            </section>

            {listaConteudos.length > 0 && (
              <section style={styles.contentsSection}>
                <div style={styles.contentsHeader}>
                  <div>
                    <span style={styles.sectionTag}>DADOS COLETADOS</span>
                    <h2 style={styles.contentsTitle}>Conteúdos analisados</h2>
                  </div>
                </div>

                <div style={styles.contentGrid}>
                  {listaConteudos.slice(0, 9).map((item, index) => (
                    <ConteudoCard key={item.id || index} item={item} index={index} />
                  ))}
                </div>
              </section>
            )}
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

  analysisSpace: {
    height: 8,
  },

  analysisTitle: {
    color: "#ff6b1a",
    fontSize: 20,
    fontWeight: 900,
    margin: "24px 0 10px",
    borderTop: "1px solid #eeeeee",
    paddingTop: 18,
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
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 15,
    color: "#333333",
    margin: "8px 0",
    overflowWrap: "break-word",
  },

  contentsSection: {
    background: "#6f7373",
    borderRadius: 26,
    padding: 24,
    border: "1px solid rgba(255,255,255,0.13)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.16)",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  contentsHeader: {
    marginBottom: 16,
  },

  contentsTitle: {
    margin: "5px 0 0",
    fontSize: 26,
    fontWeight: 900,
    color: "#ffffff",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    width: "100%",
  },

  contentCard: {
    background: "#f7f7f7",
    color: "#222222",
    borderRadius: 20,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.2)",
    boxShadow: "0 10px 25px rgba(0,0,0,0.13)",
    minWidth: 0,
    boxSizing: "border-box",
  },

  contentTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  },

  rank: {
    color: "#ff6b1a",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
  },

  contentTitle: {
    fontSize: 14,
    lineHeight: 1.42,
    margin: "6px 0 10px",
    color: "#222222",
    overflowWrap: "break-word",
  },

  scoreBox: {
    background: "#252525",
    color: "#ffffff",
    borderRadius: 14,
    padding: "8px 10px",
    minWidth: 72,
    height: "fit-content",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flexShrink: 0,
  },

  typeBadge: {
    display: "inline-block",
    background: "#ff6b1a",
    color: "#ffffff",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 900,
    marginBottom: 12,
  },

  miniGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },

  miniMetric: {
    background: "#ffffff",
    borderRadius: 12,
    padding: 9,
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
    border: "1px solid #e5e5e5",
    minWidth: 0,
  },

  linkButton: {
    display: "inline-block",
    marginTop: 12,
    background: "#252525",
    color: "#ffffff",
    padding: "9px 12px",
    borderRadius: 12,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 900,
  },
};