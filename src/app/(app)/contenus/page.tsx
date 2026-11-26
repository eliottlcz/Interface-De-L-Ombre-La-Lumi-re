import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { loadContents } from "@/lib/production-queries";
import { listEpisodeOptions, listUsers, episodeLabel } from "@/lib/queries";
import { ContentsPage } from "./contents-page";

export const metadata = { title: "Contenus" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("production.voir");
  const sp = await searchParams;
  const [items, users, episodes] = await Promise.all([loadContents(), listUsers(), listEpisodeOptions()]);
  return <ContentsPage items={items} users={users.map((u) => ({ id: u.id, label: u.name }))} episodes={episodes.map((e) => ({ id: e.id, label: episodeLabel(e) }))} canEdit={can(user, "production.modifier")} initialCreate={sp.nouveau === "1"} />;
}
