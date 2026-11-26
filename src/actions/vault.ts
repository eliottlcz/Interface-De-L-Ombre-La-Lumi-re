"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission, clientInfo } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { lockVault, setVaultUnlocked, vaultUnlockedUntil } from "@/lib/vault-lock";

const blank = (v: unknown) => (v === "" ? null : v);
const VaultInput = z.object({
  service: z.string().trim().min(1, "Le service est obligatoire").max(120),
  category: z.enum(["instagram", "tiktok", "youtube", "spotify", "apple", "email", "hebergement", "logiciel", "autre"]),
  label: z.preprocess(blank, z.string().trim().max(200).nullable().optional()),
  username: z.preprocess(blank, z.string().trim().max(320).nullable().optional()),
  url: z.preprocess(blank, z.url({ message: "Lien invalide" }).nullable().optional()),
  secret: z.string().max(5000).optional(),
  notes: z.string().max(10000).optional(),
});

export async function unlockVault(password: string) {
  return run(async () => {
    const u = await assertPermission("coffre.voir");
    const [row] = await db.select({ h: s.users.passwordHash }).from(s.users).where(eq(s.users.id, u.id));
    const { ip } = await clientInfo();
    if (!row?.h || !(await verifyPassword(row.h, password))) {
      await audit({ userId: u.id, action: "coffre.deverrouillage_refuse", sensitive: true, summary: "Échec de déverrouillage du coffre-fort", metadata: { ip } });
      userError("Mot de passe incorrect.");
    }
    const exp = await setVaultUnlocked();
    await audit({ userId: u.id, action: "coffre.deverrouillage", sensitive: true, summary: "Coffre-fort déverrouillé (10 min)", metadata: { ip } });
    return { ok: true as const, data: exp, message: "Coffre-fort déverrouillé pour 10 minutes" };
  });
}
export async function relockVault() {
  return run(async () => { await assertPermission("coffre.voir"); await lockVault(); return { ok: true as const, message: "Coffre-fort verrouillé" }; });
}

/** Révèle un secret (après déverrouillage). Chaque consultation est journalisée. */
export async function revealSecret(id: string, field: "secret" | "notes" = "secret") {
  return run(async () => {
    const u = await assertPermission("coffre.voir");
    if (!(await vaultUnlockedUntil())) userError("Coffre verrouillé : confirmez votre mot de passe.");
    const [it] = await db.select().from(s.vaultItems).where(eq(s.vaultItems.id, z.uuid().parse(id)));
    if (!it) userError("Identifiant introuvable");
    const enc = field === "secret" ? it.secretEnc : it.notesEnc;
    const value = enc ? decryptSecret(enc, `vault:${it.id}`) : "";
    const { ip } = await clientInfo();
    await audit({ userId: u.id, action: "coffre.consultation", entityType: "vault", entityId: it.id, sensitive: true, summary: `Consultation : ${it.service}${it.label ? ` (${it.label})` : ""}`, metadata: { field, ip } });
    return { ok: true as const, data: value };
  });
}

export async function saveVaultItem(id: string | null, input: z.input<typeof VaultInput>) {
  return run(async () => {
    const u = await assertPermission("coffre.modifier");
    if (!isEncryptionConfigured()) userError("Le chiffrement n'est pas configuré (VAULT_MASTER_KEY). Aucun secret ne peut être enregistré.");
    if (!(await vaultUnlockedUntil())) userError("Coffre verrouillé : confirmez votre mot de passe.");
    const v = VaultInput.parse(input);
    const base = { service: v.service, category: v.category, label: v.label, username: v.username, url: v.url, updatedBy: u.id, updatedAt: new Date() };
    let itemId = id;
    if (id) {
      const patch: Partial<typeof s.vaultItems.$inferInsert> = { ...base };
      if (v.secret) patch.secretEnc = encryptSecret(v.secret, `vault:${id}`);
      if (v.notes !== undefined) patch.notesEnc = v.notes ? encryptSecret(v.notes, `vault:${id}`) : null;
      await db.update(s.vaultItems).set(patch).where(eq(s.vaultItems.id, id));
    } else {
      if (!v.secret) userError("Le mot de passe / secret est obligatoire.");
      const newId = crypto.randomUUID();
      await db.insert(s.vaultItems).values({ id: newId, ...base, createdBy: u.id, secretEnc: encryptSecret(v.secret, `vault:${newId}`), notesEnc: v.notes ? encryptSecret(v.notes, `vault:${newId}`) : null });
      itemId = newId;
    }
    await audit({ userId: u.id, action: id ? "coffre.modification" : "coffre.ajout", entityType: "vault", entityId: itemId, sensitive: true, summary: `${id ? "Modification" : "Ajout"} : ${v.service}` });
    return { ok: true as const, message: "Identifiant enregistré (chiffré)" };
  });
}

export async function deleteVaultItem(id: string) {
  return run(async () => {
    const u = await assertPermission("coffre.modifier");
    if (!(await vaultUnlockedUntil())) userError("Coffre verrouillé : confirmez votre mot de passe.");
    const [it] = await db.delete(s.vaultItems).where(eq(s.vaultItems.id, id)).returning();
    if (it) await audit({ userId: u.id, action: "coffre.suppression", entityType: "vault", entityId: id, sensitive: true, summary: `Suppression : ${it.service}` });
    return { ok: true as const, message: "Identifiant supprimé" };
  });
}
