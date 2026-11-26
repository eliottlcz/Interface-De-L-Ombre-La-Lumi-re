import Link from "next/link";
import { requestResetAction } from "@/actions/auth";
import { AuthForm, AuthInput } from "../auth-form";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="display text-2xl">Mot de passe oublié</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Recevez un lien sécurisé, valable une heure.</p>
      <AuthForm action={requestResetAction} submit="Envoyer le lien">
        <AuthInput label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
      </AuthForm>
      <Link href="/connexion" className="mt-6 block text-center text-sm text-muted hover:text-gold">Retour à la connexion</Link>
    </>
  );
}
