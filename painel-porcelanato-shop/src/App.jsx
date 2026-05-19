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
  const fonte = data?.promocaoVigente || data?.top10 || data?.midias || data?.postsInsights || [];
  const lista = Array.isArray(fonte) ? fonte : [];

  const alcance = lista.reduce((acc, item) => acc + (item.reach || 0), 0);
  const interacoes = lista.reduce((acc, item) => acc + (item.interacoes || item.totalInteractions || 0), 0);
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

// NOVO COMPONENTE: Exibe dados da Meta
function TopContentCard({ post, ranking, onAnalisar, analisando }) {
  const permalinkSeguro = typeof post.permalink === "string" && post.permalink.startsWith("http");
  return (
    <div style={styles.postCard}>
      <h3 style={styles.postDay}>RANKING #{ranking}</h3>

      <div style={styles.postInfo}>
        <p><strong>Tipo:</strong> {post.tipo || "POST"}</p>
        <p><strong>Data:</strong> {post.data || "-"}</p>
        <p><strong>Legenda:</strong> {post.legenda || "-"}</p>
      </div>

      <div style={styles.realOfficialBox}>
        <div style={styles.cardMiniTag}>MÍDIA REAL (INSTAGRAM)</div>
        {post.imagem ? (
          <>
            <img 
              src={post.imagem} 
              alt="Thumbnail" 
              style={styles.officialImage}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = document.getElementById(`fallback-${post.id}`);
                if (fallback) fallback.style.display = "block";
              }}
            />
            <p id={`fallback-${post.id}`} style={{ ...styles.noOfficialText, display: "none" }}>
              Imagem indisponível para preview seguro
            </p>
          </>
        ) : (
          <p style={styles.noOfficialText}>Imagem indisponível para preview seguro</p>
        )}
      </div>

      <div style={styles.aiPostBox}>
        <div style={styles.aiPostHeader}>
          <div style={{ width: "100%" }}>
            <div style={styles.cardMiniTagDark}>MÉTRICAS DO CONTEÚDO</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "12px", color: "#2d2d2d", fontSize: "14px" }}>
              <div><strong>👍 Likes:</strong> {post.likes}</div>
              <div><strong>💬 Coments:</strong> {post.comments}</div>
              <div><strong>↗️ Shares:</strong> {post.shares}</div>
              <div><strong>💾 Saves:</strong> {post.saves}</div>
              <div><strong>👀 Alcance:</strong> {post.reach || "-"}</div>
              <div><strong>🔥 Interações:</strong> {post.interacoes}</div>
              <div><strong>📈 Engajamento:</strong> {post.engajamento}{post.reach > 0 ? "%" : ""}</div>
            </div>
          </div>
        </div>

        {/* BOTOES DE AÇÃO */}
        <div style={{ display: "flex", gap: "12px", marginTop: "22px", flexWrap: "wrap" }}>
          {permalinkSeguro && (
            <a 
              href={post.permalink} 
              target="_blank" 
              rel="noreferrer" 
              style={{ ...styles.copyButton, textDecoration: "none", display: "inline-block" }}
            >
              Abrir no Instagram
            </a>
          )}
          <button 
            onClick={onAnalisar} 
            disabled={analisando} 
            style={{ ...styles.generateButton, width: "auto" }}
          >
            {analisando ? "Analisando IA..." : "Analisar desempenho com IA"}
          </button>
        </div>

        {/* FEEDBACK DE CARREGAMENTO */}
        {analisando && (
          <div style={{ marginTop: "22px", padding: "16px", background: "#f8f9fa", borderRadius: "8px", border: "1px dashed #ccc" }}>
            <strong style={{ color: "#2d2d2d" }}>Mestre Técnico analisando o post...</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#666" }}>
              Avaliando ganchos, métricas e sucesso comercial.
            </p>
          </div>
        )}

        {/* RESULTADO DA ENGENHARIA REVERSA */}
        {post.analiseIA && !analisando && (
          <div style={{ marginTop: "22px", paddingTop: "22px", borderTop: "1px solid #e5e5e5" }}>
            <div style={{ ...styles.cardMiniTagDark, marginBottom: "16px" }}>ENGENHARIA REVERSA IA</div>
            {formatarAnalise(post.analiseIA)}
          </div>
        )}
      </div>
    </div>
  );
}

function PromocaoPostCard({ post, index }) {
  const permalinkSeguro = typeof post.permalink === "string" && post.permalink.startsWith("http");
  
  let badgeColor = "#ff6b1a";
  let badgeText = null;

  if (post.analiseFlag === "video_principal") {
    badgeText = "🎬 VÍDEO PRINCIPAL DA CAMPANHA";
    badgeColor = "#e84393";
  } else if (post.analiseFlag === "top_carousel") {
    badgeText = "📚 TOP CARROSSEL";
    badgeColor = "#0984e3";
  } else if (post.analiseFlag === "top_reel") {
    badgeText = "⚡ TOP REEL";
    badgeColor = "#6c5ce7";
  } else if (post.analiseFlag === "maior_alcance") {
    badgeText = "🎯 MAIOR ALCANCE";
    badgeColor = "#00b894";
  } else if (post.analiseFlag === "maior_engajamento") {
    badgeText = "🔥 MAIOR ENGAJAMENTO";
    badgeColor = "#fdcb6e";
  } else if (post.analiseFlag === "maior_retencao") {
    badgeText = "⏱️ MAIOR RETENÇÃO";
    badgeColor = "#fd79a8";
  } else if (post.analiseFlag === "pior_desempenho") {
    badgeText = "⚠️ PIOR DESEMPENHO (PAUSAR)";
    badgeColor = "#d63031";
  }

  return (
    <div style={{ ...styles.postCard, border: badgeText ? `2px solid ${badgeColor}` : "1px solid rgba(255,255,255,0.13)" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        {badgeText && (
          <div style={{ 
            background: badgeColor, 
            color: "#ffffff", 
            padding: "6px 12px", 
            borderRadius: "8px", 
            fontSize: "12px", 
            fontWeight: 900, 
            display: "inline-block"
          }}>
            {badgeText}
          </div>
        )}

        {post.recomendacaoImpulsionamento && (
          <div style={{ 
            background: "#00b894", 
            color: "#ffffff", 
            padding: "6px 12px", 
            borderRadius: "8px", 
            fontSize: "12px", 
            fontWeight: 900, 
            display: "inline-block"
          }}>
            🚀 RECOMENDADO PARA TRÁFEGO
          </div>
        )}
      </div>

      <div style={styles.postInfo}>
        <p><strong>Formato:</strong> {post.tipo || "POST"}</p>
        
        {/* Caixa de legenda com limitação de altura para evitar cards gigantes */}
        <div style={{ 
          maxHeight: "80px", 
          overflowY: "auto", 
          fontSize: "13px", 
          color: "#2d2d2d", 
          lineHeight: 1.45,
          paddingRight: "6px",
          background: "rgba(0,0,0,0.05)",
          padding: "8px",
          borderRadius: "8px",
          marginTop: "8px",
          border: "1px solid rgba(0,0,0,0.08)"
        }}>
          <strong>Legenda:</strong> {post.legenda || "-"}
        </div>
      </div>

      <div style={styles.realOfficialBox}>
        <div style={styles.cardMiniTag}>MÍDIA ANALISADA</div>
        {post.imagem ? (
          <img src={post.imagem} alt="Thumbnail" style={styles.officialImage} />
        ) : (
          <p style={styles.noOfficialText}>Imagem indisponível</p>
        )}
      </div>

      <div style={styles.aiPostBox}>
        <div style={styles.aiPostHeader}>
          <div style={{ width: "100%" }}>
            <div style={styles.cardMiniTagDark}>MÉTRICAS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px", color: "#2d2d2d", fontSize: "13px" }}>
              <div><strong>👍 Likes:</strong> {post.likes}</div>
              <div><strong>💬 Coments:</strong> {post.comments}</div>
              <div><strong>↗️ Shares:</strong> {post.shares}</div>
              <div><strong>💾 Saves:</strong> {post.saves}</div>
              <div><strong>👀 Alcance:</strong> {post.reach}</div>
              <div><strong>📈 Engajamento:</strong> {post.engajamento}%</div>
              <div><strong>🏆 Score Final:</strong> {post.score}</div>
            </div>
            
            {post.estimado && (
              <div style={{ 
                marginTop: "10px", 
                background: "#ffeaa7", 
                color: "#d63031", 
                padding: "4px 8px", 
                borderRadius: "6px", 
                fontSize: "11px", 
                fontWeight: 700,
                display: "inline-block"
              }}>
                ⚠️ Métricas estimadas (Limite de API / Organic Insights)
              </div>
            )}
          </div>
        </div>

        {post.observacaoIA && (
          <div style={{ marginTop: "16px", padding: "12px", background: "rgba(255,107,26,0.06)", borderRadius: "8px", borderLeft: "4px solid #ff6b1a" }}>
            <span style={{ fontSize: "11px", fontWeight: 900, color: "#ff6b1a", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
              💡 Observação Estratégica IA
            </span>
            <p style={{ margin: 0, fontSize: "13px", color: "#2d2d2d", lineHeight: 1.4 }}>{post.observacaoIA}</p>
          </div>
        )}

        {permalinkSeguro && (
          <a 
            href={post.permalink} 
            target="_blank" 
            rel="noreferrer" 
            style={{ ...styles.copyButton, textDecoration: "none", display: "inline-block", marginTop: "14px", width: "auto" }}
          >
            Ver Post Original
          </a>
        )}
      </div>
    </div>
  );
}

function InsightsPostCard({ post, index }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  
  const permalinkSeguro = typeof post.permalink === "string" && post.permalink.startsWith("http");
  
  let badgeColor = "#ff6b1a";
  let badgeText = null;

  if (post.analiseFlag === "video_principal") {
    badgeText = "🎬 VÍDEO PRINCIPAL";
    badgeColor = "#e84393";
  } else if (post.analiseFlag === "top_carousel") {
    badgeText = "📚 TOP CARROSSEL";
    badgeColor = "#0984e3";
  } else if (post.analiseFlag === "top_reel") {
    badgeText = "⚡ TOP REEL";
    badgeColor = "#6c5ce7";
  } else if (post.analiseFlag === "maior_alcance") {
    badgeText = "🎯 MAIOR ALCANCE";
    badgeColor = "#00b894";
  } else if (post.analiseFlag === "maior_engajamento") {
    badgeText = "🔥 MAIOR ENGAJAMENTO";
    badgeColor = "#fdcb6e";
  } else if (post.analiseFlag === "maior_retencao") {
    badgeText = "⏱️ MAIOR RETENÇÃO";
    badgeColor = "#fd79a8";
  } else if (post.analiseFlag === "pior_desempenho") {
    badgeText = "⚠️ PAUSAR RECOMENDADO";
    badgeColor = "#d63031";
  }

  const isRecomendado = post.recomendacaoImpulsionamento;

  return (
    <div 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ 
        ...styles.postCard, 
        border: isRecomendado 
          ? "3px solid #ff6b1a" 
          : index === 0 
            ? "3px solid #d4af37" 
            : badgeText 
              ? `2px dashed ${badgeColor}` 
              : "1px solid rgba(0,0,0,0.08)",
        boxShadow: hovered
          ? (isRecomendado 
              ? "0 20px 40px rgba(255, 107, 26, 0.3)" 
              : index === 0
                ? "0 20px 40px rgba(212, 175, 55, 0.3)"
                : "0 20px 40px rgba(0,0,0,0.12)")
          : (isRecomendado 
              ? "0 10px 30px rgba(255, 107, 26, 0.18)" 
              : "0 10px 24px rgba(0,0,0,0.04)"),
        transform: hovered ? "translateY(-6px) scale(1.015)" : "translateY(0) scale(1)",
        position: "relative",
        background: isRecomendado ? "#fffcf9" : "#ffffff",
        transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)"
      }}
    >
      {index === 0 && (
        <div style={{
          position: "absolute", top: "-14px", left: "20px",
          background: "linear-gradient(135deg, #d4af37 0%, #f3e5ab 50%, #aa771c 100%)",
          color: "#000000", padding: "6px 16px", borderRadius: "20px", fontSize: "11px", fontWeight: 900,
          boxShadow: "0 4px 10px rgba(212, 175, 55, 0.4)", zIndex: 2, border: "1px solid #ffffff"
        }}>
          <span>🏆 TOP #1 - MELHOR PERFORMANCE</span>
        </div>
      )}

      {isRecomendado && (
        <div style={{
          position: "absolute", top: "-14px", right: "20px",
          background: "linear-gradient(135deg, #ff6b1a 0%, #ff8a3d 100%)",
          color: "#ffffff", padding: "6px 16px", borderRadius: "20px", fontSize: "11px", fontWeight: 900,
          boxShadow: "0 4px 10px rgba(255, 107, 26, 0.4)", zIndex: 2
        }}>
          <span>🚀 IDEAL PARA TRÁFEGO PAGO</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid #eee", paddingBottom: "8px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {badgeText && (
            <div style={{ background: badgeColor, color: "#ffffff", padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 900 }}>
              {badgeText}
            </div>
          )}
          <div style={{ background: "#252525", color: "#ffffff", padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
            🎯 {post.objetivoProvavel || "conversao"}
          </div>
        </div>
        <span style={{ fontSize: "24px", fontWeight: "900", color: index === 0 ? "#d4af37" : "#cccccc" }}>
          #{index + 1}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ background: "#fff7f2", border: "1px solid #ffd2ba", borderRadius: "14px", padding: "8px", textAlign: "center" }}>
            {(post.imagem && !imgError) ? (
              <img 
                src={post.imagem} 
                alt="Mídia" 
                loading="lazy"
                onError={() => setImgError(true)}
                style={{ width: "100%", borderRadius: "10px", maxHeight: "150px", objectFit: "cover" }} 
              />
            ) : (
              <div style={{
                height: "150px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #737777 0%, #6f7373 100%)",
                borderRadius: "10px",
                color: "rgba(255,255,255,0.7)",
                fontSize: "11px",
                textAlign: "center",
                border: "1px dashed rgba(255,255,255,0.25)",
                padding: "10px"
              }}>
                <span style={{ fontSize: "24px", marginBottom: "4px" }}>🖼️</span>
                <strong>Preview do Post</strong>
                <small style={{ fontSize: "9px", opacity: 0.8 }}>Indisponível offline</small>
              </div>
            )}
          </div>
          {permalinkSeguro && (
            <a href={post.permalink} target="_blank" rel="noreferrer" style={{ ...styles.copyButton, textDecoration: "none", display: "block", textAlign: "center", fontSize: "11px", padding: "6px 10px" }}>
              Ver no Instagram
            </a>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <strong style={{ fontSize: "12px", color: "#666" }}>Legenda:</strong>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#333", maxHeight: "70px", overflowY: "auto", background: "rgba(0,0,0,0.03)", padding: "6px", borderRadius: "6px" }}>
              {post.legenda}
            </p>
          </div>

          <div>
            <strong style={{ fontSize: "12px", color: "#666" }}>Métricas:</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginTop: "4px" }}>
              <div style={{ background: "#f8f9fa", padding: "4px", borderRadius: "4px", textAlign: "center", border: "1px solid #eee", fontSize: "11px" }}>
                <span>Likes: <strong>{post.likes}</strong></span>
              </div>
              <div style={{ background: "#f8f9fa", padding: "4px", borderRadius: "4px", textAlign: "center", border: "1px solid #eee", fontSize: "11px" }}>
                <span>Comments: <strong>{post.comments}</strong></span>
              </div>
              <div style={{ background: "#f8f9fa", padding: "4px", borderRadius: "4px", textAlign: "center", border: "1px solid #eee", fontSize: "11px" }}>
                <span>Shares: <strong>{post.shares}</strong></span>
              </div>
              <div style={{ background: "#f8f9fa", padding: "4px", borderRadius: "4px", textAlign: "center", border: "1px solid #eee", fontSize: "11px" }}>
                <span>Saves: <strong>{post.saves}</strong></span>
              </div>
              <div style={{ background: "#f8f9fa", padding: "4px", borderRadius: "4px", textAlign: "center", border: "1px solid #eee", fontSize: "11px" }}>
                <span>Reach: <strong>{post.reach}</strong></span>
              </div>
              <div style={{ background: "#f8f9fa", padding: "4px", borderRadius: "4px", textAlign: "center", border: "1px solid #eee", fontSize: "11px" }}>
                <span>Engaj: <strong>{post.engajamento}%</strong></span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "12px" }}>
              <div>Score: <strong style={{ color: "#ff6b1a" }}>{post.score}</strong></div>
              {post.estimado && <span style={{ background: "#ffeaa7", color: "#d63031", padding: "1px 4px", borderRadius: "4px", fontSize: "9px" }}>Estimadas</span>}
            </div>
          </div>
        </div>
      </div>

      {post.observacaoIA && (
        <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(255,107,26,0.06)", borderRadius: "8px", borderLeft: "4px solid #ff6b1a", fontSize: "12px" }}>
          <strong style={{ color: "#ff6b1a", display: "block", fontSize: "10px", marginBottom: "2px" }}>OBSERVAÇÃO ESTRATÉGICA IA:</strong>
          <p style={{ margin: 0, color: "#2d2d2d", lineHeight: 1.4 }}>{post.observacaoIA}</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [selecionada, setSelecionada] = useState(rotas[4]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [topConteudos, setTopConteudos] = useState([]);
  const [promocaoVigentePosts, setPromocaoVigentePosts] = useState([]);
  const [insightsPosts, setInsightsPosts] = useState([]);
  const [analisandoTop, setAnalisandoTop] = useState({});
  const [gerandoImagem, setGerandoImagem] = useState({});

  const analise = useMemo(() => extrairAnalise(data), [data]);
  const metricas = useMemo(() => resumoMetricas(data, posts), [data, posts]);

  const resumoMetradasAvancado = useMemo(() => {
    if (!insightsPosts || insightsPosts.length === 0) return null;
    const totalSaves = insightsPosts.reduce((acc, p) => acc + (p.saves || 0), 0);
    const totalShares = insightsPosts.reduce((acc, p) => acc + (p.shares || 0), 0);
    const totalReach = insightsPosts.reduce((acc, p) => acc + (p.reach || 0), 0);
    const totalInteracoes = insightsPosts.reduce((acc, p) => acc + (p.interacoes || 0), 0);
    const mediaEngajamento = totalReach > 0 ? ((totalInteracoes / totalReach) * 100).toFixed(2) : "0.00";
    
    const postsOrdenadosSaves = [...insightsPosts].sort((a, b) => (b.saves || 0) - (a.saves || 0));
    const postMaisSalvo = postsOrdenadosSaves[0];
    
    const postsOrdenadosShares = [...insightsPosts].sort((a, b) => (b.shares || 0) - (a.shares || 0));
    const postMaisCompartilhado = postsOrdenadosShares[0];

    const limparParaResumo = (txt) => {
      if (!txt) return "-";
      return txt.length > 50 ? txt.slice(0, 50) + "..." : txt;
    };

    return {
      mediaEngajamento,
      totalSaves,
      totalShares,
      postMaisSalvo: postMaisSalvo ? limparParaResumo(postMaisSalvo.legenda) : "-",
      maxSavesCount: postMaisSalvo ? postMaisSalvo.saves : 0,
      postMaisCompartilhado: postMaisCompartilhado ? limparParaResumo(postMaisCompartilhado.legenda) : "-",
      maxSharesCount: postMaisCompartilhado ? postMaisCompartilhado.shares : 0
    };
  }, [insightsPosts]);

  const comparativoFormatos = useMemo(() => {
    if (!insightsPosts || insightsPosts.length === 0) return [];
    const formatos = {
      VIDEO: { nome: "Reels", count: 0, scoreTotal: 0 },
      CAROUSEL_ALBUM: { nome: "Carrossel", count: 0, scoreTotal: 0 },
      IMAGE: { nome: "Imagem Única", count: 0, scoreTotal: 0 }
    };
    insightsPosts.forEach(p => {
      const tipo = p.tipo === "VIDEO" ? "VIDEO" : p.tipo === "CAROUSEL_ALBUM" ? "CAROUSEL_ALBUM" : "IMAGE";
      if (formatos[tipo]) {
        formatos[tipo].count++;
        formatos[tipo].scoreTotal += (p.score || 0);
      }
    });
    return Object.values(formatos).filter(f => f.count > 0).map(f => ({
      ...f,
      mediaScore: Math.round(f.scoreTotal / f.count)
    }));
  }, [insightsPosts]);

  async function chamarRota(rota) {
    setSelecionada(rota);
    setLoading(true);
    setErro("");
    setData(null);

    if (rota.id === "gerar-posts") {
      setPosts([]);
    }
    if (rota.id === "top") {
      setTopConteudos([]);
    }
    if (rota.id === "promocao") {
      setPromocaoVigentePosts([]);
    }
    if (rota.id === "insights") {
      setInsightsPosts([]);
    }

    try {
      const response = await fetch(`${API_BASE}${rota.endpoint}`, {
        method: rota.id === "gerar-posts" ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(json, null, 2));
      }

      setData(json);

      if (rota.id === "gerar-posts") {
        const lista = Array.isArray(json) ? json : json.posts || [];
        setPosts(lista);
      }
      if (rota.id === "top") {
        const lista = Array.isArray(json) ? json : json.topConteudos || [];
        setTopConteudos(lista);
      }
      if (rota.id === "promocao") {
        const lista = Array.isArray(json) ? json : json.promocaoVigente || [];
        setPromocaoVigentePosts(lista);
      }
      if (rota.id === "insights") {
        const lista = Array.isArray(json) ? json : json.postsInsights || [];
        setInsightsPosts(lista);
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

  async function analisarConteudo(index, post) {
    try {
      setAnalisandoTop((prev) => ({ ...prev, [index]: true }));

      const resposta = await fetch(`${API_BASE}/analisar-conteudo-top`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post }),
      });

      const json = await resposta.json();

      if (!resposta.ok || !json.analise) {
        throw new Error(json.erro || "Erro ao analisar conteúdo.");
      }

      setTopConteudos((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, analiseIA: json.analise } : p
        )
      );
    } catch (e) {
      alert(e.message || "Erro ao analisar conteúdo.");
    } finally {
      setAnalisandoTop((prev) => ({ ...prev, [index]: false }));
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

              {selecionada.id === "gerar-posts" && posts.length > 0 && !loading && (
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

              {selecionada.id === "top" && topConteudos.length > 0 && !loading && (
                <div style={styles.postsGrid}>
                  {topConteudos.map((post, index) => (
                    <TopContentCard 
                      key={index} 
                      post={post} 
                      ranking={index + 1} 
                      onAnalisar={() => analisarConteudo(index, post)}
                      analisando={!!analisandoTop[index]}
                    />
                  ))}
                </div>
              )}

              {selecionada.id === "promocao" && promocaoVigentePosts.length > 0 && !loading && (
                <div style={{ ...styles.postsGrid, marginBottom: "30px" }}>
                  {[...promocaoVigentePosts].sort((a, b) => (b.score || 0) - (a.score || 0)).map((post, index) => (
                    <PromocaoPostCard
                      key={post.id || index}
                      post={post}
                      index={index}
                    />
                  ))}
                </div>
              )}

              {selecionada.id === "insights" && insightsPosts.length > 0 && !loading && (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  
                  {/* Bloco de Resumo Superior */}
                  {data?.resumo && (
                    <div style={{
                      display: "flex", flexDirection: "column", gap: "20px",
                      background: "#2a2d2d", padding: "24px", borderRadius: "18px",
                      border: "1px solid rgba(255, 107, 26, 0.3)", color: "#ffffff"
                    }}>
                      
                      {/* Grid Principal de Telemetria */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                        <div>
                          <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Total Analisado</span>
                          <h4 style={{ margin: "4px 0", fontSize: "20px", fontWeight: "900" }}>{data.resumo.totalPostsAnalisados} posts</h4>
                          <small style={{ color: "rgba(255,255,255,0.6)" }}>{data.resumo.periodo}</small>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Média de Engajamento</span>
                          <h4 style={{ margin: "4px 0", fontSize: "20px", fontWeight: "900" }}>{resumoMetradasAvancado?.mediaEngajamento}%</h4>
                          <small style={{ color: "rgba(255,255,255,0.6)" }}>Engajamento geral</small>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Total Compartilhamentos / Saves</span>
                          <h4 style={{ margin: "4px 0", fontSize: "20px", fontWeight: "900" }}>{resumoMetradasAvancado?.totalShares} / {resumoMetradasAvancado?.totalSaves}</h4>
                          <small style={{ color: "rgba(255,255,255,0.6)" }}>Interações orgânicas</small>
                        </div>
                        <div>
                          <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Melhor Formato</span>
                          <h4 style={{ margin: "4px 0", fontSize: "20px", fontWeight: "900" }}>{data.resumo.melhorFormato}</h4>
                          <small style={{ color: "rgba(255,255,255,0.6)" }}>Maior score ponderado</small>
                        </div>
                      </div>

                      <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "0" }} />

                      {/* Grid Secundária de Destaques e Comparativo de Formatos */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
                        <div>
                          <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Top Destaques Individuais</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", marginTop: "6px" }}>
                            <div>
                              <strong style={{ color: "#d4af37" }}>🏆 Melhor Post:</strong> {data.resumo.melhorPost}
                            </div>
                            <div>
                              <strong style={{ color: "#fd79a8" }}>💾 Mais Salvo:</strong> {resumoMetradasAvancado?.postMaisSalvo} ({resumoMetradasAvancado?.maxSavesCount} saves)
                            </div>
                            <div>
                              <strong style={{ color: "#0984e3" }}>↗️ Mais Compartilhado:</strong> {resumoMetradasAvancado?.postMaisCompartilhado} ({resumoMetradasAvancado?.maxSharesCount} shares)
                            </div>
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Comparativo de Formatos</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", marginTop: "6px" }}>
                            {comparativoFormatos?.map(f => (
                              <div key={f.nome} style={{ display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "8px" }}>
                                <span>{f.nome} ({f.count} posts)</span>
                                <strong>Score Médio: <span style={{ color: "#ff6b1a" }}>{f.mediaScore}</span></strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "0" }} />

                      <div>
                        <span style={{ fontSize: "11px", color: "#ff8a3d", fontWeight: "bold", textTransform: "uppercase" }}>Recomendação Principal</span>
                        <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "rgba(255,255,255,0.9)", lineHeight: "1.45", fontWeight: "500" }}>
                          {data.resumo.recomendacaoPrincipal}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bloco de Análise Estratégica Markdown */}
                  {analise && (
                    <div style={styles.analysisBox}>
                      <div style={{ ...styles.cardMiniTagDark, marginBottom: "16px" }}>ANÁLISE ESTRATÉGICA IA</div>
                      {formatarAnalise(analise)}
                    </div>
                  )}

                  {/* Grid de Cards da Campanha */}
                  <div>
                    <h3 style={{ fontSize: "20px", fontWeight: "900", color: "#1f1f1f", marginBottom: "16px" }}>Detalhamento por Post</h3>
                    <div style={styles.postsGrid}>
                      {[...insightsPosts].sort((a, b) => (b.score || 0) - (a.score || 0)).map((post, index) => (
                        <InsightsPostCard key={post.id || index} post={post} index={index} />
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {analise && selecionada.id !== "gerar-posts" && selecionada.id !== "top" && selecionada.id !== "insights" && (
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