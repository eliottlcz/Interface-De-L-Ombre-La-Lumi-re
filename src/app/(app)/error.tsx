"use client";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="tag-gold mb-4">Incident technique</div>
      <h1 className="display text-2xl">On a perdu le signal</h1>
      <p className="mt-3 text-soft">Une erreur est survenue en chargeant cette page. Elle a été journalisée ; vos données ne sont pas affectées.</p>
      <pre className="mx-auto mt-4 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-panel p-3 text-left text-xs text-muted">{error.message}{error.digest ? `\nréférence : ${error.digest}` : ""}</pre>
      <button onClick={reset} className="btn-light mt-6 inline-flex h-11 items-center rounded-full bg-gold px-6 font-semibold text-black">Relancer la prise</button>
    </div>
  );
}
