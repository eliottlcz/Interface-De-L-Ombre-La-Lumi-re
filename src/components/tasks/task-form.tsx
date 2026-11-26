"use client";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea, useAction } from "@/components/ui";
import { createTask, updateTask, type TaskInputT } from "@/actions/tasks";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";

export type Opt = { id: string; label: string };
export type TaskFormValue = { id?: string; title: string; description: string; assigneeId: string; priority: string; status: string; dueDate: string; contactId: string; episodeId: string };

export const emptyTask = (assigneeId = ""): TaskFormValue => ({ title: "", description: "", assigneeId, priority: "normale", status: "a_faire", dueDate: "", contactId: "", episodeId: "" });

export function TaskForm({ value, users, episodes, contacts, onDone }: { value: TaskFormValue; users: Opt[]; episodes: Opt[]; contacts: Opt[]; onDone: () => void }) {
  const [v, setV] = useState(value);
  const { pending, exec } = useAction();
  const set = (k: keyof TaskFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...v, assigneeId: v.assigneeId || null, contactId: v.contactId || null, episodeId: v.episodeId || null, dueDate: v.dueDate || null } as TaskInputT;
    exec(() => (v.id ? updateTask(v.id, payload) : createTask(payload)), { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Titre" required className="sm:col-span-2"><Input value={v.title} onChange={set("title")} required maxLength={300} /></Field>
      <Field label="Description" className="sm:col-span-2"><Textarea value={v.description} onChange={set("description")} rows={3} /></Field>
      <Field label="Responsable">
        <Select value={v.assigneeId} onChange={set("assigneeId")}>
          <option value="">Tâche commune</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
      </Field>
      <Field label="Date limite"><Input type="date" value={v.dueDate} onChange={set("dueDate")} /></Field>
      <Field label="Priorité"><Select value={v.priority} onChange={set("priority")}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Statut"><Select value={v.status} onChange={set("status")}>{Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Invité associé"><Select value={v.contactId} onChange={set("contactId")}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label="Épisode associé"><Select value={v.episodeId} onChange={set("episodeId")}><option value="">—</option>{episodes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="gold" loading={pending}>{v.id ? "Enregistrer" : "Créer la tâche"}</Button>
      </div>
    </form>
  );
}
