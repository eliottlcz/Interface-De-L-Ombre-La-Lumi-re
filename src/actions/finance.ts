"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { assertPermission } from "@/lib/auth/session";
import { run, userError } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { TX_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/labels";
import { euros } from "@/lib/dates";

const blank = (v: unknown) => (v === "" ? null : v);
const TxInput = z.object({
  type: z.enum(["depense", "recette"]),
  date: z.iso.date({ message: "Date invalide" }),
  amount: z.preprocess((v) => (typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v), z.number({ message: "Montant invalide" }).positive("Le montant doit être positif").max(10_000_000)),
  category: z.string(),
  ownerId: z.preprocess(blank, z.uuid().nullable().optional()),
  description: z.string().trim().min(1, "La description est obligatoire").max(500),
  episodeId: z.preprocess(blank, z.uuid().nullable().optional()),
  status: z.enum(["regle", "a_regler"]).default("regle"),
  dueDate: z.preprocess(blank, z.iso.date().nullable().optional()),
});
export type TxInputT = z.input<typeof TxInput>;

export async function saveTransaction(id: string | null, input: TxInputT) {
  return run(async () => {
    const u = await assertPermission("finances.modifier");
    const v = TxInput.parse(input);
    const allowed: readonly string[] = v.type === "depense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    if (!allowed.includes(v.category)) userError("Catégorie incompatible avec le type d'opération.");
    const { amount, ...rest } = v;
    const row = { ...rest, amountCents: Math.round(amount * 100), ownerId: v.ownerId ?? u.id };
    let txId = id;
    if (id) await db.update(s.transactions).set({ ...row, updatedAt: new Date() }).where(eq(s.transactions.id, id));
    else { const [t] = await db.insert(s.transactions).values({ ...row, createdBy: u.id }).returning(); txId = t.id; }
    await audit({ userId: u.id, action: id ? "finance.modification" : "finance.creation", entityType: "transaction", entityId: txId, summary: `${v.type === "depense" ? "Dépense" : "Recette"} ${euros(row.amountCents)} — ${v.description} (${TX_CATEGORIES[v.category as keyof typeof TX_CATEGORIES]})` });
    return { ok: true as const, data: txId!, message: id ? "Opération enregistrée" : "Opération ajoutée" };
  });
}

export async function deleteTransaction(id: string) {
  return run(async () => {
    const u = await assertPermission("finances.modifier");
    const [t] = await db.delete(s.transactions).where(eq(s.transactions.id, id)).returning();
    if (t) await audit({ userId: u.id, action: "finance.suppression", entityType: "transaction", entityId: id, sensitive: true, summary: `Opération supprimée : ${t.description} (${euros(t.amountCents)})`, metadata: { date: t.date, type: t.type, amountCents: t.amountCents } });
    return { ok: true as const, message: "Opération supprimée" };
  });
}
