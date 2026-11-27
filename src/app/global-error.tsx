"use client";
/** Dernier filet : une erreur au niveau le plus haut affiche son détail au lieu d'un message générique. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: "#000", color: "#f4efe0", font: "16px/1.6 system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 560, margin: "64px auto" }}>
          <p style={{ color: "#dfc662", letterSpacing: 2, fontSize: 12, textTransform: "uppercase" }}>Incident technique</p>
          <h1 style={{ fontSize: 26 }}>On a perdu le signal</h1>
          <p>Le chargement a échoué. Vos données ne sont pas affectées. Détail à transmettre à l'équipe technique :</p>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#111", border: "1px solid #333", padding: 12, borderRadius: 8, fontSize: 13 }}>
            {error.message}{error.digest ? `\nréférence : ${error.digest}` : ""}{error.stack ? `\n\n${error.stack.split("\n").slice(0, 6).join("\n")}` : ""}
          </pre>
          <button onClick={reset} style={{ marginTop: 16, height: 44, padding: "0 24px", borderRadius: 999, border: 0, background: "#dfc662", color: "#000", fontWeight: 700 }}>Relancer la prise</button>
        </div>
      </body>
    </html>
  );
}
