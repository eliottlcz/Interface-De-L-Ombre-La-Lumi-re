"use client";
import { useEffect, useState } from "react";

/** Formulaire HTML classique : l'envoi ne dépend pas de JavaScript ; le script ne sert qu'à l'indication d'attente. */
export function LoginForm({ next, error, email }: { next: string; error?: string; email?: string }) {
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => { const reset = () => { setPending(false); setSlow(false); }; window.addEventListener("pageshow", reset); return () => window.removeEventListener("pageshow", reset); }, []);
  useEffect(() => { if (!pending) return; const t = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(t); }, [pending]);
  return (
    <form method="post" action="/api/connexion" onSubmit={() => setPending(true)} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-soft">Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={email ?? ""} className="h-12 rounded-lg border border-line bg-night px-4 text-cream focus:border-gold focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-soft">Mot de passe</span>
        <input name="password" type="password" autoComplete="current-password" required className="h-12 rounded-lg border border-line bg-night px-4 text-cream focus:border-gold focus:outline-none" />
      </label>
      {error && <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-[#f3c3b7]">{error}</p>}
      <button disabled={pending} aria-busy={pending} className="btn-light mt-2 h-12 rounded-full bg-gold font-semibold text-black transition hover:bg-[#e8d27a] disabled:opacity-80">
        {pending ? "On allume les projecteurs…" : "Entrer dans le QG"}
      </button>
      {slow && <p className="text-center text-xs text-muted">La connexion est lente. Patientez, ou actualisez la page et réessayez : vos données ne sont pas perdues.</p>}
    </form>
  );
}
