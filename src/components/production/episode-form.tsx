"use client";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea, useAction } from "@/components/ui";
import { createEpisode, updateEpisode, type EpisodeInputT } from "@/actions/production";
import type { PublicationLinks } from "@/lib/db/schema";

export type EpisodeFormValue = {
  id?: string; title: string; number: string; contactId: string; producerId: string; shootDay: string; shootTime: string; shootLocation: string;
  prepNotes: string; interviewQuestions: string; videoUrl: string; audioUrl: string; graphicsUrl: string; adminDocsUrl: string;
  plannedPublishDate: string; publicationLinks: PublicationLinks; driveFolderUrl: string;
};
export const emptyEpisode = (producerId = ""): EpisodeFormValue => ({ title: "", number: "", contactId: "", producerId, shootDay: "", shootTime: "10:00", shootLocation: "", prepNotes: "", interviewQuestions: "", videoUrl: "", audioUrl: "", graphicsUrl: "", adminDocsUrl: "", plannedPublishDate: "", publicationLinks: {}, driveFolderUrl: "" });
const LINKS: [keyof PublicationLinks, string][] = [["youtube", "YouTube"], ["spotify", "Spotify"], ["apple", "Apple Podcasts"], ["deezer", "Deezer"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["autre", "Autre"]];

export function EpisodeForm({ value, users, contacts, onDone, full }: { value: EpisodeFormValue; users: { id: string; label: string }[]; contacts: { id: string; label: string }[]; onDone: (id?: string) => void; full?: boolean }) {
  const [v, setV] = useState(value);
  const { pending, exec } = useAction();
  const set = (k: keyof EpisodeFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const { id, ...payload } = v;
      let newId: string | undefined;
      exec(async () => { const r = id ? await updateEpisode(id, payload as EpisodeInputT) : await createEpisode(payload as EpisodeInputT); if (r.ok && "data" in r && typeof r.data === "string") newId = r.data; return r; }, { onSuccess: () => onDone(newId) });
    }}>
      <Field label="Titre de l'épisode" required className="sm:col-span-2"><Input value={v.title} onChange={set("title")} required placeholder="Tout a basculé" /></Field>
      <Field label="Numéro"><Input type="number" min={1} value={v.number} onChange={set("number")} placeholder="01" /></Field>
      <Field label="Invité"><Select value={v.contactId} onChange={set("contactId")}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label="Responsable de production"><Select value={v.producerId} onChange={set("producerId")}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
      <Field label="Publication prévue"><Input type="date" value={v.plannedPublishDate} onChange={set("plannedPublishDate")} /></Field>
      <Field label="Date de tournage"><Input type="date" value={v.shootDay} onChange={set("shootDay")} /></Field>
      <Field label="Heure"><Input type="time" value={v.shootTime} onChange={set("shootTime")} /></Field>
      <Field label="Lieu de tournage" className="sm:col-span-2"><Input value={v.shootLocation} onChange={set("shootLocation")} /></Field>
      {full && <>
        <Field label="Notes préparatoires" className="sm:col-span-2"><Textarea rows={4} value={v.prepNotes} onChange={set("prepNotes")} /></Field>
        <Field label="Questions d'interview" className="sm:col-span-2"><Textarea rows={8} value={v.interviewQuestions} onChange={set("interviewQuestions")} placeholder={"- Comment t'est venue cette passion ?\n- Le moment où tout a basculé…"} /></Field>
        <Field label="Lien vidéo (rushs / master)"><Input type="url" value={v.videoUrl} onChange={set("videoUrl")} /></Field>
        <Field label="Lien audio"><Input type="url" value={v.audioUrl} onChange={set("audioUrl")} /></Field>
        <Field label="Documents graphiques"><Input type="url" value={v.graphicsUrl} onChange={set("graphicsUrl")} /></Field>
        <Field label="Documents administratifs"><Input type="url" value={v.adminDocsUrl} onChange={set("adminDocsUrl")} /></Field>
        <Field label="Dossier Google Drive" className="sm:col-span-2"><Input value={v.driveFolderUrl} onChange={set("driveFolderUrl")} placeholder="https://drive.google.com/drive/folders/…" /></Field>
        <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-1.5 text-xs font-medium text-soft">Liens de publication</legend>
          {LINKS.map(([k, l]) => <Input key={k} type="url" placeholder={l} aria-label={l} value={v.publicationLinks[k] ?? ""} onChange={(e) => setV({ ...v, publicationLinks: { ...v.publicationLinks, [k]: e.target.value } })} />)}
        </fieldset>
      </>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => onDone()}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>{v.id ? "Enregistrer" : "Créer l'épisode"}</Button></div>
    </form>
  );
}
