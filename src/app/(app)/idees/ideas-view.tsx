"use client";
import { useState } from "react";
import { Ago } from "@/components/ui";
import Link from "next/link";
import { Star, EyeOff, ListPlus, Sparkles, ExternalLink, Undo2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, useAction, cx } from "@/components/ui";
import { generateIdeasNow, ideaToTask, setIdeaStatus } from "@/actions/ideas";
import { formatDate, timeAgo } from "@/lib/dates";

type Idea = { id: string; day: string; title: string; category: string | null; description: string; relevance: string; interest: string; actions: string[]; sources: { title: string; url: string }[]; status: "nouvelle" | "favori" | "ignoree" | "transformee"; taskId: string | null; model: string };

export function IdeasView({ ideas, lastRun, configured, model, today, focus, users, meId, canGenerate, canTask }: {
  ideas: Idea[]; lastRun: { status: string; message: string | null; at: string } | null; configured: boolean; model: string; today: string; focus: string | null;
  users: { id: string; label: string }[]; meId: string; canGenerate: boolean; canTask: boolean;
}) {
  const [tab, setTab] = useState<"jour" | "favoris" | "historique" | "ignorees">("jour");
  const [toTask, setToTask] = useState<Idea | null>(null);
  const { pending, exec } = useAction();
  const todays = ideas.filter((i) => i.day === today);
  const list = tab === "jour" ? todays : tab === "favoris" ? ideas.filter((i) => i.status === "favori") : tab === "ignorees" ? ideas.filter((i) => i.status === "ignoree") : ideas.filter((i) => i.day !== today && i.status !== "ignoree");

  return (
    <div>
      <PageHeader eyebrow="Idées du jour" title="Deux pistes pour sortir de l'ombre"
        description="Chaque jour, exactement deux idées nouvelles, fidèles au média kit : invités de l'ombre, formats, collaborations, événements, stratégies." />

      {!configured ? (
        <Card className="mb-6 border-gold/40 p-5">
          <div className="mb-1 font-semibold">Configuration manquante</div>
          <p className="text-sm text-soft">Aucune clé d&apos;API IA n&apos;est configurée sur le serveur (variable <code className="text-gold">ANTHROPIC_API_KEY</code>). Aucune idée n&apos;est générée tant qu&apos;elle n&apos;est pas ajoutée — rien n&apos;est simulé.</p>
        </Card>
      ) : (
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          {todays.length < 2 && canGenerate && <Button variant="gold" loading={pending} onClick={() => exec(() => generateIdeasNow())}><Sparkles className="size-4" />{todays.length ? "Compléter les idées du jour" : "Générer les idées du jour"}</Button>}
          <span className="text-muted">Génération automatique chaque matin · modèle {model}{lastRun && <> · dernier essai <Ago value={lastRun.at} /> : {lastRun.status === "succes" ? "réussi" : lastRun.status === "en_cours" ? "en cours" : "échec"}</>}</span>
          {lastRun?.status === "erreur" && <span className="w-full text-xs text-alert">{lastRun.message}</span>}
        </div>
      )}

      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { value: "jour", label: "Aujourd'hui", count: todays.length }, { value: "favoris", label: "Favoris", count: ideas.filter((i) => i.status === "favori").length },
        { value: "historique", label: "Historique" }, { value: "ignorees", label: "Ignorées" },
      ]} />

      {list.length === 0 ? <EmptyState title={tab === "jour" ? "Pas encore d'idées aujourd'hui" : "Rien ici"}>{tab === "jour" ? (configured ? "Elles arrivent chaque matin, ou lancez la génération." : "Configurez la clé d'IA pour activer le module.") : ""}</EmptyState> : (
        <div className={cx("grid grid-cols-1 gap-4", tab === "jour" && "xl:grid-cols-2")}>
          {list.map((i, n) => (
            <article key={i.id} id={i.id} className={cx("card lightable flex flex-col p-6", focus === i.id && "border-gold", i.status === "ignoree" && "opacity-60")}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {tab === "jour" && <span className="tag-gold">Idée {String(n + 1).padStart(2, "0")}</span>}
                {i.category && <Badge>{i.category}</Badge>}
                {i.status === "favori" && <Badge tone="gold"><Star className="size-3" />Favori</Badge>}
                {i.status === "transformee" && <Badge tone="ok">Transformée en tâche</Badge>}
                <span className="ml-auto text-[11px] text-muted">{formatDate(i.day)}</span>
              </div>
              <h2 className="display text-xl leading-tight">{i.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-soft">{i.description}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><div className="eyebrow mb-1">Pertinence</div><p className="text-sm">{i.relevance}</p></div>
                <div><div className="eyebrow mb-1">Intérêt pour le média</div><p className="text-sm">{i.interest}</p></div>
              </div>
              <div className="mt-4"><div className="eyebrow mb-1">Actions concrètes</div><ul className="list-disc pl-5 text-sm">{i.actions.map((a, k) => <li key={k}>{a}</li>)}</ul></div>
              {i.sources.length > 0 && <div className="mt-4"><div className="eyebrow mb-1">Sources</div><ul className="flex flex-col gap-1 text-sm">{i.sources.map((src) => <li key={src.url}><a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gold hover:underline"><ExternalLink className="size-3" />{src.title}</a></li>)}</ul></div>}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                {i.status !== "favori" && i.status !== "transformee" && <Button size="sm" onClick={() => exec(() => setIdeaStatus(i.id, "favori"))}><Star className="size-3.5" />Favori</Button>}
                {i.status === "favori" && <Button size="sm" variant="ghost" onClick={() => exec(() => setIdeaStatus(i.id, "nouvelle"))}>Retirer des favoris</Button>}
                {canTask && !i.taskId && <Button size="sm" variant="gold" onClick={() => setToTask(i)}><ListPlus className="size-3.5" />Transformer en tâche</Button>}
                {i.taskId && <Link href={`/missions?espace=tout&tache=${i.taskId}`} className="inline-flex h-8 items-center text-xs text-gold">Voir la tâche →</Link>}
                {i.status !== "ignoree" && i.status !== "transformee" && <Button size="sm" variant="ghost" onClick={() => exec(() => setIdeaStatus(i.id, "ignoree"))}><EyeOff className="size-3.5" />Ignorer</Button>}
                {i.status === "ignoree" && <Button size="sm" variant="ghost" onClick={() => exec(() => setIdeaStatus(i.id, "nouvelle"))}><Undo2 className="size-3.5" />Restaurer</Button>}
              </div>
              <p className="mt-3 text-[10px] text-muted">Proposée par l&apos;IA ({i.model}) — à vérifier avant toute prise de contact.</p>
            </article>
          ))}
        </div>
      )}
      <Modal open={toTask !== null} onClose={() => setToTask(null)} title="Transformer en tâche">
        {toTask && <TaskFromIdea idea={toTask} users={users} meId={meId} onDone={() => setToTask(null)} />}
      </Modal>
    </div>
  );
}
function TaskFromIdea({ idea, users, meId, onDone }: { idea: Idea; users: { id: string; label: string }[]; meId: string; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [who, setWho] = useState(meId); const [due, setDue] = useState("");
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); exec(() => ideaToTask(idea.id, who || null, due || null), { onSuccess: onDone }); }}>
      <p className="text-sm text-soft">« {idea.title} » — la description, les actions et les sources seront reprises dans la tâche.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Responsable"><Select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Tâche commune</option>{users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select></Field>
        <Field label="Échéance"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" variant="gold" loading={pending}>Créer la tâche</Button></div>
    </form>
  );
}
