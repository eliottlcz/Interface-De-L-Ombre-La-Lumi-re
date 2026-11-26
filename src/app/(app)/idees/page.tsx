import { desc, eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { db, schema as s } from "@/lib/db";
import { isAiConfigured, AI_MODEL } from "@/lib/ai-config";
import { listUsers } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import { IdeasView } from "./ideas-view";

export const metadata = { title: "Idées du jour" };

export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ idee?: string }> }) {
  const user = await requirePagePermission("idees.voir");
  const { idee } = await searchParams;
  const [ideas, runs, users] = await Promise.all([
    db.select().from(s.ideas).orderBy(desc(s.ideas.day), desc(s.ideas.createdAt)).limit(400),
    db.select().from(s.ideaRuns).where(eq(s.ideaRuns.day, todayISO())).orderBy(desc(s.ideaRuns.createdAt)).limit(1),
    listUsers(),
  ]);
  return <IdeasView
    ideas={ideas.map((i) => ({ id: i.id, day: i.day, title: i.title, category: i.category, description: i.description, relevance: i.relevance, interest: i.interest, actions: i.actions, sources: i.sources, status: i.status, taskId: i.taskId, model: i.model }))}
    lastRun={runs[0] ? { status: runs[0].status, message: runs[0].message, at: runs[0].createdAt.toISOString() } : null}
    configured={isAiConfigured()} model={AI_MODEL} today={todayISO()} focus={idee ?? null}
    users={users.map((u) => ({ id: u.id, label: u.name }))} meId={user.id}
    canGenerate={can(user, "idees.generer")} canTask={can(user, "taches.modifier")} />;
}
