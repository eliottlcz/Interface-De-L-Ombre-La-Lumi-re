import Image from "next/image";

/**
 * Écran d'accès : panneau gauche purement typographique (aucun visuel),
 * la citation sort lentement de l'ombre ; à droite, le bloc de connexion.
 * Sur iPad portrait et smartphone : bloc centré seul, la citation passe en pied de page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-ink lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line/60 px-14 py-14 lg:flex">
        <div className="eyebrow">Coulisses · accès équipe</div>
        <blockquote className="max-w-xl">
          <p className="quote reveal-light text-[56px] leading-[1.02] text-cream">« Personne ne voit ce qu’il y a avant. »</p>
          <footer className="mt-8 flex items-center gap-3 text-sm text-muted">
            <span className="h-px w-10 bg-gold" />Le quartier général de l’équipe
          </footer>
        </blockquote>
        <div className="flex items-end justify-between text-[11px] uppercase tracking-[0.22em] text-muted/70">
          <span>Un épisode toutes les deux semaines</span>
          <span className="tabular-nums">Paris</span>
        </div>
        <span aria-hidden className="beam" />
      </section>

      <section className="flex flex-col items-center justify-center px-6 py-12 pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-sm animate-in">
          <Image src="/brand/logo-tile.png" alt="De l'Ombre à la Lumière" width={104} height={104} className="mb-10 rounded-xl" priority />
          {children}
        </div>
        <p className="quote mt-16 text-center text-lg text-muted lg:hidden">« Personne ne voit ce qu’il y a avant. »</p>
      </section>
    </main>
  );
}
