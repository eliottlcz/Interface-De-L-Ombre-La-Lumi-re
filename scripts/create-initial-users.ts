/**
 * Création des comptes initiaux par INVITATION (aucun mot de passe n'est défini ici).
 * Usage :
 *   npm run db:seed-users -- --eliott=adresse@exemple.fr --arthur=adresse@exemple.fr
 * Le script affiche deux liens à usage unique (valables 7 jours) : chacun choisit son mot de passe.
 */
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { seedReferenceData } from "../src/lib/seed";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });
  await seedReferenceData(db);
  const people = [
    { email: arg("eliott"), name: "Eliott Le Clezio", role: "administrateur" as const, title: "Producteur exécutif & co-fondateur" },
    { email: arg("arthur"), name: "Arthur Pomarede", role: "collaborateur" as const, title: "Journaliste & fondateur" },
  ];
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  for (const p of people) {
    if (!p.email) { console.log(`— ${p.name} : aucune adresse fournie (--${p.name.split(" ")[0].toLowerCase()}=…), ignoré`); continue; }
    const exists = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${p.email.toLowerCase()}`);
    if (exists.length) { console.log(`— ${p.name} : compte déjà existant`); continue; }
    const token = randomBytes(32).toString("base64url");
    await db.insert(schema.authTokens).values({
      type: "invitation", email: p.email.toLowerCase(), name: p.name, role: p.role,
      tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 864e5),
    });
    console.log(`✓ Invitation ${p.name} (${p.role}) : ${base}/lien/${token}`);
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
