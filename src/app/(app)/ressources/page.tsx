import { desc, inArray, and, eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { ResourcesView, type ResourceRow } from "./resources-view";

export const metadata = { title: "Ressources" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("ressources.voir");
  const sp = await searchParams;
  const restricted = can(user, "ressources.restreintes");
  const rows = await db.select().from(s.resources).where(restricted ? undefined : eq(s.resources.restricted, false)).orderBy(desc(s.resources.updatedAt));
  const files = rows.length ? await db.select({ id: s.attachments.id, entityId: s.attachments.entityId, filename: s.attachments.filename, url: s.attachments.url, size: s.attachments.size, mimeType: s.attachments.mimeType, createdAt: s.attachments.createdAt })
    .from(s.attachments).where(and(eq(s.attachments.entityType, "resource"), inArray(s.attachments.entityId, rows.map((r) => r.id)))) : [];
  const resources: ResourceRow[] = rows.map((r) => ({
    id: r.id, section: r.section, category: r.category, title: r.title, description: r.description, body: r.body, url: r.url, restricted: r.restricted, updatedAt: r.updatedAt.toISOString(),
    files: files.filter((f) => f.entityId === r.id).map((f) => ({ id: f.id, filename: f.filename, url: f.url, size: f.size, mimeType: f.mimeType, hasFile: !f.url, createdAt: f.createdAt.toISOString(), uploadedBy: null })),
  }));
  return <ResourcesView resources={resources} canEdit={can(user, "ressources.modifier")} canRestricted={restricted} canVault={can(user, "coffre.voir")}
    initialCreate={sp.nouveau === "1"} openId={sp.r ?? null} />;
}
