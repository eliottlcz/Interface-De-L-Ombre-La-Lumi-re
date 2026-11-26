import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr] bg-ink">
      <section className="relative hidden overflow-hidden lg:block">
        <Image src="/brand/silhouette.jpg" alt="" fill priority className="object-cover object-top opacity-90" sizes="55vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="quote text-4xl leading-tight text-cream">« Personne ne voit ce qu&apos;il y a avant. »</p>
          <p className="mt-4 text-sm text-muted">Le quartier général — réservé à l&apos;équipe.</p>
        </div>
      </section>
      <section className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Image src="/brand/logo-tile.png" alt="De l'Ombre à la Lumière" width={112} height={112} className="mb-10 rounded-xl" priority />
          {children}
        </div>
      </section>
    </main>
  );
}
