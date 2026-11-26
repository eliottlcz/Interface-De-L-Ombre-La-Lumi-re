"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, SectionTitle } from "@/components/ui";
import { TaskCard, type TaskView } from "@/components/tasks/task-card";

export function HomeTasks({ tasks, canEdit, title }: { tasks: TaskView[]; canEdit: boolean; title: string }) {
  const router = useRouter();
  const sorted = [...tasks].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <Card className="p-5">
      <SectionTitle title={title} eyebrow={`${tasks.length} en cours`} action={<Link href="/missions" className="text-xs text-gold">Mes missions →</Link>} />
      {sorted.length === 0 ? <p className="text-sm text-muted">Aucune tâche ouverte. Profitez-en.</p> : (
        <div className="flex flex-col gap-2">{sorted.slice(0, 6).map((t) => <TaskCard key={t.id} t={t} canEdit={canEdit} onOpen={() => router.push(`/missions?tache=${t.id}`)} />)}</div>
      )}
    </Card>
  );
}
