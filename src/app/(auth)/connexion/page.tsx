import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthForm, AuthInput } from "../auth-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fin?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next, fin } = await searchParams;
  return (
    <>
      <h1 className="display text-2xl">Connexion</h1>
      <p className="mt-2 mb-8 text-sm text-muted">{fin ? "Coupez ! Vous êtes bien déconnecté. À la prochaine prise." : "Accès réservé à l’équipe. Ici, on prépare tout ce que personne ne voit."}</p>
      <AuthForm action={loginAction} submit="Entrer dans le QG">
        <input type="hidden" name="next" value={next ?? "/"} />
        <AuthInput label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
        <AuthInput label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
      </AuthForm>
      <Link href="/mot-de-passe-oublie" className="mt-6 block text-center text-sm text-muted hover:text-gold">Mot de passe oublié ?</Link>
    </>
  );
}
