import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fin?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next, fin } = await searchParams;
  let flash: { error?: string; email?: string } = {};
  try { const raw = (await cookies()).get("dlal_flash")?.value; if (raw) flash = JSON.parse(raw); } catch { /* ignoré */ }
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <>
      <h1 className="display text-2xl">Connexion</h1>
      <p className="mt-2 mb-8 text-sm text-muted">{fin ? "Coupez ! Vous êtes bien déconnecté. À la prochaine prise." : "Accès réservé à l’équipe. Ici, on prépare tout ce que personne ne voit."}</p>
      <LoginForm next={safeNext} error={flash.error} email={flash.email} />
      <Link href="/mot-de-passe-oublie" className="mt-6 block text-center text-sm text-muted hover:text-gold">Mot de passe oublié ?</Link>
    </>
  );
}
