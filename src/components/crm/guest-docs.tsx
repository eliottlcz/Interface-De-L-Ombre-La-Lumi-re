"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Upload, Link2, Trash2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, Button, ConfirmButton, Input, Select, useAction } from "@/components/ui";
import { attachGuestDocProof, createGuestDoc, deleteGuestDoc, setGuestDocStatus } from "@/actions/guest-docs";
import { GUEST_DOC_KIND, GUEST_DOC_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/dates";

export type GuestDocView = {
  id: string; contactId: string; contactName?: string; episodeId: string | null; episodeTitle?: string | null;
  kind: keyof typeof GUEST_DOC_KIND; title: string; status: keyof typeof GUEST_DOC_STATUS;
  proofAttachmentId: string | null; proofUrl: string | null; receivedAt: string | null; validatedAt: string | null; validatedByName: string | null;
};
const tone = (st: GuestDocView["status"]) => (st === "valide" ? "ok" : st === "recu" ? "gold" : st === "demande" ? "olive" : "alert");

export function GuestDocs({ docs, contactId, episodeId, canEdit, showContact }: { docs: GuestDocView[]; contactId?: string; episodeId?: string | null; canEdit: boolean; showContact?: boolean }) {
  const { pending, exec } = useAction();
  const [kind, setKind] = useState<GuestDocView["kind"]>("droit_image");
  return (
    <div className="flex flex-col gap-2">
      {docs.length === 0 && <p className="text-sm text-muted">Aucun document suivi.</p>}
      {docs.map((d) => <DocRow key={d.id} d={d} canEdit={canEdit} showContact={showContact} />)}
      {canEdit && contactId && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Select value={kind} onChange={(e) => setKind(e.target.value as GuestDocView["kind"])} className="sm:w-auto" aria-label="Type de document">
            {Object.entries(GUEST_DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Button loading={pending} onClick={() => exec(() => createGuestDoc({ contactId, episodeId, kind }))}>Suivre ce document</Button>
        </div>
      )}
    </div>
  );
}

function DocRow({ d, canEdit, showContact }: { d: GuestDocView; canEdit: boolean; showContact?: boolean }) {
  const { pending, exec } = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [url, setUrl] = useState("");
  const hasProof = Boolean(d.proofAttachmentId || d.proofUrl);
  const send = (fd: FormData) => { fd.set("id", d.id); exec(() => attachGuestDocProof(fd), { onSuccess: () => { setLinkMode(false); setUrl(""); } }); };
  return (
    <div className="rounded-xl border border-line bg-night p-3">
      <div className="flex flex-wrap items-center gap-2">
        {d.status === "valide" ? <ShieldCheck className="size-4 text-ok" /> : <ShieldAlert className="size-4 text-gold" />}
        <span className="font-medium">{d.title}</span>
        <Badge tone={tone(d.status)}>{GUEST_DOC_STATUS[d.status]}</Badge>
        {showContact && d.contactName && <Link href={`/crm/${d.contactId}`} className="text-xs text-gold">{d.contactName}</Link>}
        {d.episodeTitle && <Link href={`/production/${d.episodeId}`} className="text-xs text-muted hover:text-gold">{d.episodeTitle}</Link>}
      </div>
      <div className="mt-1 text-xs text-muted">
        {hasProof
          ? <>Preuve : <a className="text-gold" target="_blank" rel="noopener noreferrer" href={d.proofUrl ?? `/api/attachments/${d.proofAttachmentId}`}>ouvrir</a>{d.receivedAt && ` · reçue le ${formatDate(d.receivedAt)}`}{d.validatedAt && ` · validée le ${formatDate(d.validatedAt)} par ${d.validatedByName ?? "—"}`}</>
          : "Aucune preuve reçue — non considéré comme signé."}
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={file} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.set("file", f); send(fd); } e.target.value = ""; }} />
          {d.status !== "valide" && <Button size="sm" loading={pending} onClick={() => file.current?.click()}><Upload className="size-3.5" />Déposer le document signé</Button>}
          {d.status !== "valide" && <Button size="sm" variant="ghost" onClick={() => setLinkMode(!linkMode)}><Link2 className="size-3.5" />Lien</Button>}
          {d.status === "manquant" && <Button size="sm" variant="ghost" onClick={() => exec(() => setGuestDocStatus(d.id, "demande"))}>Marquer « demandé »</Button>}
          {d.status === "recu" && <Button size="sm" variant="gold" onClick={() => exec(() => setGuestDocStatus(d.id, "valide"))}><Check className="size-3.5" />Valider</Button>}
          {d.status === "valide" && <ConfirmButton size="sm" variant="outline" message="Annuler la validation de ce document ?" onConfirm={() => exec(() => setGuestDocStatus(d.id, "demande"))}>Annuler la validation</ConfirmButton>}
          <ConfirmButton size="sm" variant="ghost" message={`Ne plus suivre « ${d.title} » ?`} onConfirm={() => exec(() => deleteGuestDoc(d.id))}><Trash2 className="size-3.5" /></ConfirmButton>
        </div>
      )}
      {linkMode && (
        <div className="mt-2 flex gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Lien vers le document signé (Drive…)" />
          <Button variant="gold" disabled={!url} onClick={() => { const fd = new FormData(); fd.set("url", url); send(fd); }}>OK</Button>
        </div>
      )}
    </div>
  );
}
