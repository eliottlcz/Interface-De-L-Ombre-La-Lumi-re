"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Select, Textarea, useAction } from "@/components/ui";
import { createContact, updateContact, type ContactInputT } from "@/actions/crm";
import { CONTACT_CATEGORY, PRIORITY } from "@/lib/labels";
import type { Socials } from "@/lib/db/schema";

export type ContactFormValue = {
  id?: string; firstName: string; lastName: string; profession: string; company: string; email: string; phone: string;
  socials: Socials; category: string; priority: string; ownerId: string; whyInteresting: string; notes: string;
  lastEmailSubject: string; nextAction: string; nextFollowupAt: string; shootDate: string; publishDate: string; episodeUrl: string; driveFolderUrl: string;
  responseReceived: boolean;
};
export const emptyContact = (category = "a_contacter", ownerId = ""): ContactFormValue => ({
  firstName: "", lastName: "", profession: "", company: "", email: "", phone: "", socials: {}, category, priority: "normale", ownerId,
  whyInteresting: "", notes: "", lastEmailSubject: "", nextAction: "", nextFollowupAt: "", shootDate: "", publishDate: "", episodeUrl: "", driveFolderUrl: "", responseReceived: false,
});

const SOCIALS: [keyof Socials, string][] = [["instagram", "Instagram"], ["tiktok", "TikTok"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"], ["x", "X"], ["site", "Site web"]];

export function ContactForm({ value, users, onDone }: { value: ContactFormValue; users: { id: string; label: string }[]; onDone: (id?: string) => void }) {
  const [v, setV] = useState(value);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const { pending, exec } = useAction();
  const set = (k: keyof ContactFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const submit = (force = false) => {
    const { id, ...payload } = v;
    let dupHit = false; let newId: string | undefined;
    exec(async () => {
      const r = id ? await updateContact(id, payload as ContactInputT) : await createContact(payload as ContactInputT, { force });
      if (!r.ok && r.error.startsWith("Doublon possible")) { setDupWarning(r.error); dupHit = true; return { ok: true as const }; }
      if (r.ok && "data" in r && typeof r.data === "string") newId = r.data;
      return r;
    }, { onSuccess: () => { if (!dupHit) onDone(newId); } });
  };
  const cat = v.category;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setDupWarning(null); submit(); }} className="grid gap-4 sm:grid-cols-2">
      <Field label="Prénom" required><Input value={v.firstName} onChange={set("firstName")} required autoComplete="off" /></Field>
      <Field label="Nom"><Input value={v.lastName} onChange={set("lastName")} autoComplete="off" /></Field>
      <Field label="Profession"><Input value={v.profession} onChange={set("profession")} placeholder="Chorégraphe, directrice de casting…" /></Field>
      <Field label="Entreprise / structure"><Input value={v.company} onChange={set("company")} /></Field>
      <Field label="E-mail"><Input type="email" value={v.email} onChange={set("email")} autoComplete="off" /></Field>
      <Field label="Téléphone"><Input type="tel" value={v.phone} onChange={set("phone")} /></Field>
      <Field label="Catégorie"><Select value={v.category} onChange={set("category")}>{Object.entries(CONTACT_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Responsable du contact"><Select value={v.ownerId} onChange={set("ownerId")}><option value="">Moi</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
      <Field label="Priorité"><Select value={v.priority} onChange={set("priority")}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Prochaine relance / date de suivi"><Input type="date" value={v.nextFollowupAt} onChange={set("nextFollowupAt")} /></Field>
      {(cat === "a_contacter" || v.whyInteresting) && <Field label="Pourquoi cette personne est intéressante" className="sm:col-span-2"><Textarea rows={2} value={v.whyInteresting} onChange={set("whyInteresting")} placeholder="Le rôle peu visible qu'elle occupe, ce que son parcours raconte…" /></Field>}
      {(cat === "mail_envoye" || cat === "a_relancer") && <>
        <Field label="Objet du dernier mail"><Input value={v.lastEmailSubject} onChange={set("lastEmailSubject")} /></Field>
        <Field label="Prochaine action"><Input value={v.nextAction} onChange={set("nextAction")} /></Field>
      </>}
      {cat === "invite_recu" && <>
        <Field label="Date de tournage"><Input type="date" value={v.shootDate} onChange={set("shootDate")} /></Field>
        <Field label="Date de publication"><Input type="date" value={v.publishDate} onChange={set("publishDate")} /></Field>
        <Field label="Lien vers l'épisode" className="sm:col-span-2"><Input type="url" value={v.episodeUrl} onChange={set("episodeUrl")} placeholder="https://youtube.com/…" /></Field>
      </>}
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
        <legend className="mb-1.5 text-xs font-medium text-soft">Réseaux sociaux</legend>
        {SOCIALS.map(([k, l]) => <Input key={k} placeholder={l} value={v.socials[k] ?? ""} onChange={(e) => setV({ ...v, socials: { ...v.socials, [k]: e.target.value } })} aria-label={l} />)}
      </fieldset>
      <Field label="Dossier Google Drive (lien)" className="sm:col-span-2"><Input value={v.driveFolderUrl} onChange={set("driveFolderUrl")} placeholder="https://drive.google.com/drive/folders/…" /></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={v.notes} onChange={set("notes")} /></Field>
      {dupWarning && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm sm:col-span-2">
          {dupWarning}
          <div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="gold" onClick={() => { submit(true); }}>Créer quand même</Button><Link href={`/crm?q=${encodeURIComponent(v.firstName + " " + v.lastName)}`} className="text-gold underline">Voir le contact existant</Link></div>
        </div>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>Annuler</Button>
        <Button type="submit" variant="gold" loading={pending}>{v.id ? "Enregistrer" : "Ajouter le contact"}</Button>
      </div>
    </form>
  );
}
