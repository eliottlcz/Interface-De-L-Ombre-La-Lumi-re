"use client";
import { useState } from "react";
import { Ago } from "@/components/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, KeyRound, LogOut, PlugZap, ShieldCheck, UserPlus, CheckCircle2, AlertTriangle, CircleDashed } from "lucide-react";
import { Avatar, Badge, Button, Card, Checkbox, ConfirmButton, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, useAction, useToast } from "@/components/ui";
import { adminResetLink, changePassword, inviteUser, revokeSessions, updateProfile, updateUserAccess } from "@/actions/users";
import { disconnectIntegration } from "@/actions/stats";
import { ROLE_LABELS, type Permission, type Role } from "@/lib/auth/permissions";
import { formatDateTime, timeAgo } from "@/lib/dates";

type U = { id: string; name: string; email: string; title: string | null; role: Role; active: boolean; overrides: Record<string, boolean>; lastLoginAt: string | null };
type Integ = { id: string; label: string; configured: boolean; env: string[]; connected: boolean; account: string | null; lastSync: string | null; lastError: string | null; expiresAt: string | null; docs?: string };
type Props = {
  tab: string; flash: { error: string | null; connected: string | null };
  me: { id: string; name: string; email: string; title: string; role: Role; permissions: Permission[] };
  perms: { admin: boolean; permissions: boolean; integrations: boolean; journal: boolean; exports: boolean };
  users: U[]; invites: { id: string; email: string; name: string | null; role: Role | null; expiresAt: string }[]; integrations: Integ[];
  system: { mail: boolean; encryption: boolean; ai: boolean; aiModel: string; cron: boolean; directDb: boolean };
  permissionCatalog: Record<string, string>; rolePermissions: Record<Role, Permission[]>;
  audits: { id: string; name: string | null; summary: string; action: string; at: string }[];
  logins: { id: string; email: string; success: boolean; ip: string | null; ua: string | null; reason: string | null; at: string }[];
  sessions: { id: string; ua: string | null; ip: string | null; lastSeenAt: string }[];
};

export function SettingsView(p: Props) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const setTab = (t: string) => { const q = new URLSearchParams(sp.toString()); q.set("onglet", t); q.delete("erreur"); q.delete("connecte"); router.replace(`${pathname}?${q}`, { scroll: false }); };
  const tabs = [
    { value: "profil", label: "Mon profil" },
    ...(p.perms.admin || p.perms.permissions ? [{ value: "equipe", label: "Équipe & permissions" }] : []),
    { value: "integrations", label: "Intégrations" },
    ...(p.perms.journal ? [{ value: "journal", label: "Journal & sécurité" }] : []),
    ...(p.perms.exports ? [{ value: "donnees", label: "Exports & sauvegardes" }] : []),
  ];
  const tab = tabs.some((t) => t.value === p.tab) ? p.tab : "profil";
  return (
    <div>
      <PageHeader eyebrow="Paramètres" title="La régie" description="Votre compte, l'équipe, les intégrations, la sécurité et les données du QG." />
      {p.flash.error && <div className="mb-4 rounded-xl border border-alert/40 bg-alert/10 px-4 py-3 text-sm">Connexion impossible : {decodeURIComponent(p.flash.error).replace(/_/g, " ")}</div>}
      {p.flash.connected && <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">Intégration connectée : {p.flash.connected}. Première synchronisation lancée.</div>}
      <Tabs value={tab} onChange={setTab} className="mb-6" items={tabs} />
      {tab === "profil" && <Profile {...p} />}
      {tab === "equipe" && <Team {...p} />}
      {tab === "integrations" && <Integrations {...p} />}
      {tab === "journal" && <Journal {...p} />}
      {tab === "donnees" && <Data {...p} />}
    </div>
  );
}

function Profile({ me, sessions }: Props) {
  const { pending, exec } = useAction();
  const [v, setV] = useState({ name: me.name, title: me.title });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3"><Avatar name={me.name} size={44} /><div><div className="font-semibold">{me.email}</div><Badge tone="gold">{ROLE_LABELS[me.role]}</Badge></div></div>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => updateProfile(v)); }}>
          <Field label="Nom affiché"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
          <Field label="Fonction"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Producteur exécutif…" /></Field>
          <div className="flex justify-end"><Button type="submit" variant="gold" loading={pending}>Enregistrer</Button></div>
        </form>
      </Card>
      <Card className="p-5">
        <div className="mb-4 font-semibold">Changer de mot de passe</div>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (pw.next !== pw.confirm) return; exec(() => changePassword(pw.current, pw.next), { onSuccess: () => setPw({ current: "", next: "", confirm: "" }) }); }}>
          <Field label="Mot de passe actuel"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
          <Field label="Nouveau (10 caractères min., lettres et chiffres)"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={10} /></Field>
          <Field label="Confirmer" hint={pw.confirm && pw.next !== pw.confirm ? "Les deux saisies diffèrent." : undefined}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
          <div className="flex justify-end"><Button type="submit" variant="gold" loading={pending} disabled={!pw.next || pw.next !== pw.confirm}>Changer</Button></div>
        </form>
      </Card>
      <Card className="p-5 xl:col-span-2">
        <div className="mb-3 font-semibold">Mes appareils connectés</div>
        <ul className="flex flex-col">{sessions.map((s) => <li key={s.id} className="flex flex-wrap gap-x-3 border-b border-line/60 py-2 text-sm last:border-0"><span className="min-w-0 flex-1 truncate text-soft">{describeUA(s.ua)}</span><span className="text-muted">{s.ip ?? "—"}</span><span className="text-muted">actif <Ago value={s.lastSeenAt} /></span></li>)}</ul>
        <p className="mt-3 text-xs text-muted">Changer de mot de passe déconnecte tous vos autres appareils.</p>
      </Card>
    </div>
  );
}
function describeUA(ua: string | null) {
  if (!ua) return "Appareil inconnu";
  const dev = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "PC Windows" : "Ordinateur";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  return `${dev} · ${br}`;
}

function Team({ me, users, invites, perms, permissionCatalog, rolePermissions, system }: Props) {
  const { pending, exec } = useAction();
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [inv, setInv] = useState({ email: "", name: "", role: "collaborateur" });
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<U | null>(null);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast("Lien copié"); } catch { toast("Copie impossible : sélectionnez le lien", "error"); } };
  return (
    <div className="flex flex-col gap-6">
      {perms.admin && <div className="flex flex-wrap items-center gap-3"><Button variant="gold" onClick={() => { setInviting(true); setLink(null); }}><UserPlus className="size-4" />Inviter un collaborateur</Button>
        <span className="text-xs text-muted">{system.mail ? "Les invitations partent par e-mail." : "E-mail non configuré : le lien d'invitation s'affiche pour être transmis directement."}</span></div>}
      <Card className="overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
            <Avatar name={u.name} size={34} />
            <div className="min-w-0 flex-1"><div className="font-medium">{u.name} {!u.active && <Badge tone="muted">Désactivé</Badge>}</div><div className="truncate text-xs text-muted">{u.email} · {u.title ?? "—"} · dernière connexion {u.lastLoginAt ? <Ago value={u.lastLoginAt} /> : "jamais"}</div></div>
            <Badge tone="gold">{ROLE_LABELS[u.role]}</Badge>
            {Object.keys(u.overrides).length > 0 && <Badge>{Object.keys(u.overrides).length} ajustement(s)</Badge>}
            <div className="flex gap-2">
              {perms.permissions && <Button size="sm" onClick={() => setEditing(u)}>Droits</Button>}
              {perms.admin && <Button size="sm" variant="ghost" onClick={() => exec(() => adminResetLink(u.id), { onSuccess: (r) => { const d = (r as { data?: { link: string; sent: boolean } }).data; if (d && !d.sent) setLink(d.link); } })}><KeyRound className="size-3.5" />Réinit.</Button>}
              {perms.admin && u.id !== me.id && <ConfirmButton size="sm" variant="ghost" message={`Déconnecter ${u.name} de tous ses appareils ?`} onConfirm={() => exec(() => revokeSessions(u.id))}><LogOut className="size-3.5" /></ConfirmButton>}
            </div>
          </div>
        ))}
      </Card>
      {link && <Card className="border-gold/50 p-4"><div className="mb-2 text-sm font-semibold">Lien à transmettre à la personne (usage unique)</div><div className="flex gap-2"><Input readOnly value={link} onFocus={(e) => e.target.select()} /><Button onClick={() => copy(link)}><Copy className="size-4" /></Button></div></Card>}
      {invites.length > 0 && <Card className="p-5"><div className="mb-2 font-semibold">Invitations en attente</div>{invites.map((i) => <div key={i.id} className="text-sm text-soft">{i.name ?? i.email} · {i.email} · {i.role ? ROLE_LABELS[i.role] : ""} · expire <Ago value={i.expiresAt} /></div>)}</Card>}
      <Card className="p-5">
        <div className="mb-3 font-semibold">Ce que permet chaque rôle</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs">
          <thead><tr className="text-left text-muted"><th className="py-2 pr-3">Permission</th>{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <th key={r} className="px-2 py-2 text-center">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>{Object.entries(permissionCatalog).map(([k, l]) => <tr key={k} className="border-t border-line/60"><td className="py-1.5 pr-3 text-soft">{l}</td>{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <td key={r} className="text-center">{rolePermissions[r].includes(k as Permission) ? <span className="text-gold">●</span> : <span className="text-line-strong">·</span>}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="mt-3 text-xs text-muted">Toutes les permissions sont vérifiées côté serveur. Les ajustements individuels (bouton « Droits ») priment sur le rôle.</p>
      </Card>
      <Modal open={inviting} onClose={() => setInviting(false)} title="Inviter un collaborateur">
        {link ? (
          <div className="flex flex-col gap-3"><p className="text-sm text-soft">Invitation créée. Transmettez ce lien (valable 7 jours, usage unique) :</p><div className="flex gap-2"><Input readOnly value={link} onFocus={(e) => e.target.select()} /><Button onClick={() => copy(link)}><Copy className="size-4" /></Button></div><div className="flex justify-end"><Button variant="gold" onClick={() => setInviting(false)}>Terminé</Button></div></div>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => inviteUser(inv), { onSuccess: (r) => { const d = (r as { data?: { link: string; sent: boolean } }).data; if (d?.sent) setInviting(false); else if (d) setLink(d.link); setInv({ email: "", name: "", role: "collaborateur" }); } }); }}>
            <Field label="Prénom et nom" required><Input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} required /></Field>
            <Field label="Adresse e-mail" required><Input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} required /></Field>
            <Field label="Rôle"><Select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setInviting(false)}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Créer l&apos;invitation</Button></div>
          </form>
        )}
      </Modal>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Droits — ${editing.name}` : ""} wide>
        {editing && <AccessForm u={editing} catalog={permissionCatalog} rolePermissions={rolePermissions} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function AccessForm({ u, catalog, rolePermissions, onDone }: { u: U; catalog: Record<string, string>; rolePermissions: Record<Role, Permission[]>; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [role, setRole] = useState<Role>(u.role);
  const [active, setActive] = useState(u.active);
  const [title, setTitle] = useState(u.title ?? "");
  const [ov, setOv] = useState<Record<string, boolean>>(u.overrides);
  const base = new Set(rolePermissions[role]);
  const eff = (k: string) => (k in ov ? ov[k] : base.has(k as Permission));
  const toggle = (k: string, v: boolean) => { const n = { ...ov }; if (v === base.has(k as Permission)) delete n[k]; else n[k] = v; setOv(n); };
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => updateUserAccess(u.id, { role, active, title, overrides: ov }), { onSuccess: onDone }); }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rôle"><Select value={role} onChange={(e) => { setRole(e.target.value as Role); setOv({}); }}>{Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Fonction"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="flex items-end pb-2"><Checkbox checked={active} onChange={setActive} label="Compte actif" /></div>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {Object.entries(catalog).map(([k, l]) => <div key={k} className="flex items-center gap-2"><Checkbox checked={eff(k)} onChange={(v) => toggle(k, v)} label={<span className="text-sm">{l}{k in ov && <span className="ml-1 text-xs text-gold">(ajusté)</span>}</span>} /></div>)}
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Enregistrer les droits</Button></div>
    </form>
  );
}

function Integrations({ integrations, perms, system }: Props) {
  const { exec } = useAction();
  const items: { label: string; ok: boolean; text: string }[] = [
    { label: "Chiffrement des secrets", ok: system.encryption, text: system.encryption ? "VAULT_MASTER_KEY présente : coffre-fort et jetons chiffrés (AES-256-GCM)." : "VAULT_MASTER_KEY absente : coffre-fort et intégrations OAuth inutilisables." },
    { label: "Intelligence artificielle (idées du jour)", ok: system.ai, text: system.ai ? `Clé configurée · modèle ${system.aiModel}` : "ANTHROPIC_API_KEY absente : module en attente de configuration." },
    { label: "E-mails (invitations, réinitialisation)", ok: system.mail, text: system.mail ? "Resend configuré." : "RESEND_API_KEY / MAIL_FROM absents : les liens s'affichent pour être transmis à la main. Notifications par e-mail : option future." },
    { label: "Tâche quotidienne", ok: system.cron, text: system.cron ? "CRON_SECRET présent : rappels, idées et synchronisations chaque matin." : "CRON_SECRET absent : rien ne s'exécute automatiquement." },
    { label: "Synchronisation temps réel", ok: true, text: "Vérification toutes les 4 secondes sur chaque appareil ouvert, sans connexion permanente." },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {integrations.map((i) => {
          const state = !i.configured ? ["muted", "Non configuré", CircleDashed] as const : !i.connected ? ["muted", "Non connecté", CircleDashed] as const : i.lastError ? ["alert", "Erreur", AlertTriangle] as const : ["ok", "Connecté", CheckCircle2] as const;
          const Icon = state[2];
          return (
            <Card key={i.id} className="p-5">
              <div className="mb-2 flex items-center gap-2"><span className="text-lg font-semibold">{i.label}</span><Badge tone={state[0]}><Icon className="size-3" />{state[1]}</Badge></div>
              {i.connected && <p className="text-sm text-soft">{i.account ?? "Compte connecté"}{i.lastSync && <> · synchronisé <Ago value={i.lastSync} /></>}{i.expiresAt && i.id === "instagram" && ` · autorisation jusqu'au ${formatDateTime(i.expiresAt)}`}</p>}
              {i.lastError && <p className="mt-1 text-xs text-alert">{i.lastError}</p>}
              {!i.configured && <p className="text-xs text-muted">À ajouter dans l&apos;hébergement : {i.env.join(", ")}.{i.docs && <> {i.docs}</>}</p>}
              {perms.integrations && i.configured && (
                <div className="mt-3 flex gap-2">
                  <a href={`/api/integrations/connect/${i.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-semibold text-black"><PlugZap className="size-4" />{i.connected ? "Reconnecter" : "Connecter"}</a>
                  {i.connected && <ConfirmButton size="md" variant="outline" message={`Déconnecter ${i.label} ? Les jetons d'accès seront supprimés.`} onConfirm={() => exec(() => disconnectIntegration(i.id))}>Déconnecter</ConfirmButton>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <Card className="p-5">
        <div className="mb-3 font-semibold">Configuration du serveur</div>
        <ul className="flex flex-col gap-3">{items.map((x) => <li key={x.label} className="flex gap-3 text-sm">{x.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />}<span><span className="font-medium">{x.label}</span><span className="block text-muted">{x.text}</span></span></li>)}</ul>
      </Card>
    </div>
  );
}

function Journal({ audits, logins }: Props) {
  const [view, setView] = useState<"actions" | "connexions">("actions");
  return (
    <div>
      <Tabs value={view} onChange={setView} className="mb-4" items={[{ value: "actions", label: "Actions sensibles" }, { value: "connexions", label: "Connexions" }]} />
      <Card className="overflow-hidden">
        {view === "actions" ? (audits.length === 0 ? <EmptyState title="Aucune action sensible" /> : audits.map((a) => (
          <div key={a.id} className="flex flex-wrap gap-x-3 border-b border-line/60 px-4 py-2.5 text-sm last:border-0"><ShieldCheck className="mt-0.5 size-4 text-gold" /><span className="font-medium">{a.name ?? "Système"}</span><span className="min-w-0 flex-1 text-soft">{a.summary}</span><span className="text-xs text-muted" title={formatDateTime(a.at)}><Ago value={a.at} /></span></div>
        ))) : logins.map((l) => (
          <div key={l.id} className="flex flex-wrap gap-x-3 border-b border-line/60 px-4 py-2.5 text-sm last:border-0">
            <Badge tone={l.success ? "ok" : "alert"}>{l.success ? "Réussie" : "Échec"}</Badge><span>{l.email}</span><span className="text-muted">{l.reason?.replace(/_/g, " ") ?? ""}</span><span className="min-w-0 flex-1 truncate text-xs text-muted">{l.ip ?? ""} · {describeUA(l.ua)}</span><span className="text-xs text-muted">{formatDateTime(l.at)}</span>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-muted">Journal en écriture seule : la base de données refuse toute modification ou suppression d&apos;une entrée. Après 5 échecs en 15 minutes, la connexion d&apos;un compte est temporairement bloquée.</p>
    </div>
  );
}

function Data({ perms }: Props) {
  const exp = [["contacts", "Contacts / invités"], ["taches", "Tâches"], ["finances", "Dépenses et recettes"], ["production", "Données de production"]];
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3 font-semibold">Exports</div>
        <ul className="flex flex-col gap-2">{exp.map(([k, l]) => (
          <li key={k} className="flex items-center gap-3 border-b border-line/60 pb-2 text-sm last:border-0"><span className="flex-1">{l}</span>
            <a href={`/api/export/${k}?format=csv`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-xs hover:border-gold"><Download className="size-3.5" />CSV</a>
            <a href={`/api/export/${k}?format=xlsx`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-xs hover:border-gold"><Download className="size-3.5" />Excel</a></li>
        ))}</ul>
        <p className="mt-3 text-xs text-muted">Les exports n&apos;incluent jamais les identifiants du coffre-fort ni les jetons des intégrations. Chaque export est journalisé.</p>
      </Card>
      <Card className="p-5">
        <div className="mb-3 font-semibold">Sauvegardes</div>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-soft">
          <li><span className="text-cream">Automatiques</span> : sauvegardes quotidiennes de la base par l&apos;hébergeur (Supabase : quotidiennes, restauration à un instant précis selon l&apos;offre).</li>
          <li><span className="text-cream">Manuelles</span> : sauvegarde complète téléchargeable ci-dessous (toutes les tables, secrets toujours chiffrés).</li>
          <li><span className="text-cream">Historique</span> : chaque modification est tracée dans le journal d&apos;activité, en écriture seule.</li>
        </ul>
        {perms.admin ? <a href="/api/sauvegarde" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-gold px-4 text-sm font-semibold text-black"><Download className="size-4" />Télécharger une sauvegarde complète</a> : <p className="mt-3 text-xs text-muted">Réservé aux administrateurs.</p>}
        <p className="mt-3 text-xs text-muted">Restauration : voir DEPLOIEMENT.md, section « Récupération en cas d&apos;erreur » (script de restauration dans une base vide, même clé de chiffrement).</p>
      </Card>
    </div>
  );
}
