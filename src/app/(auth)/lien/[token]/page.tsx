import Link from "next/link";
import { consumeTokenAction, describeToken } from "@/actions/auth";
import { AuthForm, AuthInput } from "../../auth-form";

export const metadata = { title: "Activer mon accès" };

export default async function TokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await describeToken(token);
  if (!info) {
    return (
      <>
        <h1 className="display text-2xl">Lien expiré</h1>
        <p className="mt-3 text-sm text-muted">Ce lien est invalide, déjà utilisé ou expiré. Demandez-en un nouveau à un administrateur.</p>
        <Link href="/connexion" className="mt-6 inline-block text-sm text-gold">Retour à la connexion</Link>
      </>
    );
  }
  const invite = info.type === "invitation";
  return (
    <>
      <h1 className="display text-2xl">{invite ? "Bienvenue" : "Nouveau mot de passe"}</h1>
      <p className="mt-2 mb-8 text-sm text-muted">{invite ? `Créez votre accès pour ${info.email}.` : `Compte : ${info.email}`}</p>
      <AuthForm action={consumeTokenAction} submit={invite ? "Créer mon compte" : "Enregistrer"}>
        <input type="hidden" name="token" value={token} />
        {invite && <AuthInput label="Prénom et nom" name="name" defaultValue={info.name ?? ""} required />}
        <AuthInput label="Mot de passe (10 caractères min., lettres et chiffres)" name="password" type="password" autoComplete="new-password" required minLength={10} />
        <AuthInput label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" required />
      </AuthForm>
    </>
  );
}
