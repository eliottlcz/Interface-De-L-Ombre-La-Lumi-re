import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink px-6 text-center">
      <div className="tag-gold">Hors champ</div>
      <h1 className="display text-3xl">Cette page est restée dans l&apos;ombre</h1>
      <p className="max-w-md text-soft">Elle n&apos;existe pas, ou plus. Rien de grave : tout le reste est en place.</p>
      <Link href="/" className="btn-light mt-4 inline-flex h-11 items-center rounded-full bg-gold px-6 font-semibold text-black">Retour au QG</Link>
    </main>
  );
}
