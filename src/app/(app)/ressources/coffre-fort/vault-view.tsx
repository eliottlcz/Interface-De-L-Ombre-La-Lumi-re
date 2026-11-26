"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Copy, Lock, Unlock, Plus, Pencil, Trash2, ShieldCheck, ExternalLink } from "lucide-react";
import { Badge, Button, Card, ConfirmButton, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea, useAction, useToast } from "@/components/ui";
import { deleteVaultItem, relockVault, revealSecret, saveVaultItem, unlockVault } from "@/actions/vault";
import { VAULT_CATEGORIES } from "@/lib/labels";
import { formatDateTime, timeAgo } from "@/lib/dates";

type Item = { id: string; service: string; category: string; label: string | null; username: string | null; url: string | null; hasNotes: boolean; updatedAt: string };
const REVEAL_MS = 20_000;

export function VaultView({ items, log, unlockedUntil, canEdit, encryptionReady }: { items: Item[]; log: { id: string; summary: string; name: string | null; at: string }[]; unlockedUntil: number | null; canEdit: boolean; encryptionReady: boolean }) {
  const [until, setUntil] = useState<number | null>(unlockedUntil);
  const [now, setNow] = useState(Date.now());
  const [pw, setPw] = useState("");
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const { pending, exec } = useAction();
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const unlocked = until !== null && until > now;

  return (
    <div>
      <Link href="/ressources" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-gold"><ArrowLeft className="size-4" />Ressources</Link>
      <PageHeader eyebrow="Coffre-fort" title="Ce qui reste dans l'ombre"
        description="Identifiants des comptes du média, chiffrés (AES-256-GCM) côté serveur. Masqués par défaut, révélés temporairement, chaque consultation est journalisée."
        actions={unlocked ? <>
          <span className="text-xs text-muted">Verrouillage auto. dans {Math.max(0, Math.ceil((until! - now) / 60000))} min</span>
          <Button onClick={() => exec(() => relockVault(), { onSuccess: () => setUntil(null) })}><Lock className="size-4" />Verrouiller</Button>
          {canEdit && <Button variant="gold" onClick={() => setEdit("new")}><Plus className="size-4" />Ajouter</Button>}
        </> : undefined} />

      {!encryptionReady && <div className="mb-6 rounded-xl border border-alert/40 bg-alert/10 p-4 text-sm">Chiffrement non configuré : la variable VAULT_MASTER_KEY est absente du serveur. Le coffre-fort reste fermé tant qu&apos;elle n&apos;est pas définie.</div>}

      {!unlocked && (
        <Card className="mb-6 max-w-lg p-6">
          <div className="mb-3 flex items-center gap-2"><Lock className="size-5 text-gold" /><span className="font-semibold">Coffre verrouillé</span></div>
          <p className="mb-4 text-sm text-soft">Confirmez votre mot de passe pour consulter ou modifier les identifiants pendant 10 minutes.</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); exec(() => unlockVault(pw), { onSuccess: (r) => { setPw(""); setUntil((r as { data?: number }).data ?? Date.now() + 600_000); } }); }}>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Votre mot de passe" autoComplete="current-password" aria-label="Mot de passe" />
            <Button type="submit" variant="gold" loading={pending} disabled={!pw}><Unlock className="size-4" />Ouvrir</Button>
          </form>
        </Card>
      )}

      {items.length === 0 ? <EmptyState title="Coffre vide">Instagram, TikTok, YouTube, Spotify, Apple Podcasts, adresses e-mail, hébergement, logiciels…</EmptyState> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((it) => <VaultCard key={it.id} it={it} unlocked={unlocked} canEdit={canEdit} onEdit={() => setEdit(it)} />)}
        </div>
      )}

      {log.length > 0 && (
        <Card className="mt-8 p-5">
          <div className="mb-3 flex items-center gap-2"><ShieldCheck className="size-4 text-gold" /><span className="display text-xs">Journal des consultations</span></div>
          <ul className="flex flex-col gap-2 text-sm">{log.map((l) => <li key={l.id} className="flex flex-wrap gap-x-2"><span className="text-muted" title={formatDateTime(l.at)}>{timeAgo(l.at)}</span><span className="font-medium">{l.name ?? "—"}</span><span className="text-soft">{l.summary}</span></li>)}</ul>
        </Card>
      )}

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit === "new" ? "Nouvel identifiant" : "Modifier l'identifiant"}>
        {edit !== null && <VaultForm init={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}

function VaultCard({ it, unlocked, canEdit, onEdit }: { it: Item; unlocked: boolean; canEdit: boolean; onEdit: () => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { exec } = useAction();
  const toast = useToast();
  const hide = () => { setShown(null); setNotes(null); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!unlocked) hide(); }, [unlocked]);
  const reveal = (field: "secret" | "notes") => exec(async () => {
    const r = await revealSecret(it.id, field);
    if (r.ok) { field === "secret" ? setShown(r.data as string) : setNotes(r.data as string); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(hide, REVEAL_MS); }
    return r;
  }, { refresh: false });
  const copy = () => exec(async () => {
    const r = await revealSecret(it.id, "secret");
    if (r.ok) { try { await navigator.clipboard.writeText(r.data as string); toast("Copié — pensez à ne pas le coller n'importe où"); setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30_000); } catch { toast("Copie impossible sur cet appareil", "error"); } }
    return r.ok ? { ok: true as const } : r;
  }, { refresh: false });
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div><Badge>{VAULT_CATEGORIES[it.category as keyof typeof VAULT_CATEGORIES] ?? it.category}</Badge><div className="mt-2 font-semibold">{it.service}</div>{it.label && <div className="text-xs text-muted">{it.label}</div>}</div>
        {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-gold" aria-label="Ouvrir le service"><ExternalLink className="size-4" /></a>}
      </div>
      {it.username && <div className="mb-2 text-sm"><span className="text-muted">Identifiant : </span><span className="break-all">{it.username}</span></div>}
      <div className="flex items-center gap-2 rounded-lg border border-line bg-night px-3 py-2 font-mono text-sm">
        <span className="min-w-0 flex-1 break-all">{shown ?? "••••••••••••"}</span>
        {shown && <span className="text-[10px] text-muted">masqué dans 20 s</span>}
      </div>
      {notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-night p-2 text-xs text-soft">{notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!unlocked} onClick={() => (shown ? hide() : reveal("secret"))}>{shown ? <><EyeOff className="size-3.5" />Masquer</> : <><Eye className="size-3.5" />Révéler</>}</Button>
        <Button size="sm" variant="ghost" disabled={!unlocked} onClick={copy}><Copy className="size-3.5" />Copier</Button>
        {it.hasNotes && <Button size="sm" variant="ghost" disabled={!unlocked} onClick={() => reveal("notes")}>Notes</Button>}
        {canEdit && unlocked && <>
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Modifier"><Pencil className="size-3.5" /></Button>
          <ConfirmButton size="sm" variant="ghost" message={`Supprimer définitivement l'identifiant « ${it.service} » ?`} onConfirm={() => exec(() => deleteVaultItem(it.id))}><Trash2 className="size-3.5" /></ConfirmButton>
        </>}
      </div>
    </Card>
  );
}

function VaultForm({ init, onDone }: { init: Item | null; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [v, setV] = useState({ service: init?.service ?? "", category: init?.category ?? "instagram", label: init?.label ?? "", username: init?.username ?? "", url: init?.url ?? "", secret: "", notes: "" });
  const [show, setShow] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form autoComplete="off" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); exec(() => saveVaultItem(init?.id ?? null, { ...v, category: v.category as "autre", notes: init && !v.notes ? undefined : v.notes }), { onSuccess: onDone }); }}>
      <Field label="Service" required><Input value={v.service} onChange={set("service")} required placeholder="Instagram" /></Field>
      <Field label="Catégorie"><Select value={v.category} onChange={set("category")}>{Object.entries(VAULT_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Libellé"><Input value={v.label} onChange={set("label")} placeholder="Compte principal" /></Field>
      <Field label="Identifiant / e-mail"><Input value={v.username} onChange={set("username")} autoComplete="off" /></Field>
      <Field label="Adresse du service" className="sm:col-span-2"><Input type="url" value={v.url} onChange={set("url")} /></Field>
      <Field label={init ? "Nouveau mot de passe (laisser vide pour conserver)" : "Mot de passe / secret"} required={!init} className="sm:col-span-2">
        <div className="flex gap-2"><Input type={show ? "text" : "password"} value={v.secret} onChange={set("secret")} autoComplete="new-password" required={!init} /><Button type="button" variant="ghost" onClick={() => setShow(!show)} aria-label="Afficher">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div>
      </Field>
      <Field label={init ? "Notes chiffrées (remplacent les actuelles si renseignées)" : "Notes chiffrées (codes de secours…)"} className="sm:col-span-2"><Textarea rows={3} value={v.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Chiffrer et enregistrer</Button></div>
    </form>
  );
}
