import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listAttachments, listContactOptions, listEpisodeOptions, listUsers, episodeLabel } from "@/lib/queries";
import { loadTaskComments, loadTasks } from "@/lib/task-queries";
import { MissionsView } from "./missions-view";

export const metadata = { title: "Mes missions" };

export default async function MissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePagePermission("taches.voir");
  const sp = await searchParams;
  const [tasks, users, episodes, contacts] = await Promise.all([loadTasks(), listUsers(), listEpisodeOptions(), listContactOptions()]);
  const openId = sp.tache && tasks.some((t) => t.id === sp.tache) ? sp.tache : null;
  const detail = openId ? { comments: await loadTaskComments(openId), files: await listAttachments("task", openId) } : null;
  return (
    <MissionsView
      me={{ id: user.id, name: user.name }}
      canEdit={can(user, "taches.modifier")}
      canDeleteAll={can(user, "taches.supprimer_toutes")}
      tasks={tasks}
      users={users.map((u) => ({ id: u.id, label: u.name }))}
      episodes={episodes.map((e) => ({ id: e.id, label: episodeLabel(e) }))}
      contacts={contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))}
      openId={openId}
      detail={detail}
      initialCreate={sp.nouveau === "1"}
    />
  );
}
