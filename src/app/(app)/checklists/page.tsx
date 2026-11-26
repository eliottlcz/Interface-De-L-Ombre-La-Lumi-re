import { eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { schema as s } from "@/lib/db";
import { loadChecklists } from "@/lib/production-queries";
import { listEpisodeOptions, episodeLabel } from "@/lib/queries";
import { ChecklistsView } from "./checklists-view";

export const metadata = { title: "Checklists" };

export default async function ChecklistsPage() {
  const user = await requirePagePermission("production.voir");
  const [templates, active, episodes] = await Promise.all([
    loadChecklists(eq(s.checklists.isTemplate, true)),
    loadChecklists(eq(s.checklists.isTemplate, false)),
    listEpisodeOptions(),
  ]);
  return <ChecklistsView templates={templates} active={active} episodes={episodes.map((e) => ({ id: e.id, label: episodeLabel(e) }))} canEdit={can(user, "production.modifier")} />;
}
