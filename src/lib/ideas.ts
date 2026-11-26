import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/lib/db";
import { AI_MODEL, isAiConfigured } from "@/lib/ai-config";
import { addDaysISO, todayISO } from "@/lib/dates";
import { notifyAll } from "@/lib/notify";

/**
 * Référence éditoriale : extrait fidèle du média kit officiel (« Media Kit DLAL »).
 * Ne pas reformuler : c'est la ligne que l'IA doit respecter.
 */
export const MEDIA_KIT = `DE L'OMBRE À LA LUMIÈRE — Le Podcast qui Révèle les Coulisses de la Création.
LE CONCEPT : « De l'Ombre à la Lumière » est un podcast vidéo d'interview explorant les parcours fascinants des figures clés des industries créatives. Chaque épisode plonge dans les coulisses : comment se construisent les carrières, quelles sont les décisions pivots, les défis cachés, les conseils des professionnels qui façonnent notre culture audiovisuelle, cinématographique et artistique. Format : conversations authentiques, 25-45 min, production professionnelle.
LA MISSION : Donner la parole à ceux que l'on entend moins sur des projets/missions d'envergures culturels, cinématographiques, audiovisuels, sportifs… « De l'Ombre à la Lumière » documente les parcours authentiques de ceux qui façonnent le contenu que vous consommez et de ceux qui oeuvrent de manière discrète au monde qui nous entoure.
OBJECTIF : VALORISER LES RÔLES PEU VISIBLES. Ceux qui ne sont jamais sur les tapis rouges ; les producteurs qui montent les projets impossibles, les directeurs de casting qui révèlent les talents, les responsables politiques cachés dans les arrières bureaux et qui participent grandement au rayonnement du pays, les seconds rôles dans leur profession que l'on ne voit peu, méritent une plateforme.
CHIFFRES : 1 épisode toutes les 2 semaines ; production semi-professionnelle (studios parisiens équipés) ; cible : grand public français (18-45 ans) ; plateformes : YouTube, TikTok, Instagram, Spotify/Apple Podcasts (et Deezer).
STRATÉGIE D'AUDIENCE : full episodes (YouTube, Spotify) ; court-form clips (TikTok/Instagram Reels) ; teasing multi-plateforme.
ÉQUIPE : Eliott Le Clezio (producteur exécutif & co-fondateur) ; Arthur Pomarede (journaliste & fondateur).
SIGNATURE : « Le média qui donne la parole à ceux qui façonnent les grands moments. »`;

const IdeaSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().min(3).max(200),
    category: z.string().max(60),
    description: z.string().min(20),
    relevance: z.string().min(10),
    interest: z.string().min(10),
    actions: z.array(z.string()).min(1).max(6),
    sources: z.array(z.object({ title: z.string(), url: z.string().url() })).max(6).default([]),
  })).length(2),
});

const SYSTEM = `Tu es le conseiller éditorial du média « De l'Ombre à la Lumière ». Tu respectes strictement son identité, décrite dans le média kit officiel ci-dessous, sans jamais la reformuler ni la réinventer.

${MEDIA_KIT}

Ta mission : proposer EXACTEMENT deux idées nouvelles, concrètes et actionnables pour le média, utiles à l'équipe aujourd'hui. Catégories possibles : personnalité de l'ombre à interviewer (métier peu visible derrière un grand moment), invité inattendu, collaboration, format vidéo, concept éditorial, partenariat, événement culturel ou professionnel, opportunité de développement, stratégie de communication.

Règles :
- Privilégie les rôles peu visibles derrière des projets d'envergure (culture, cinéma, audiovisuel, musique, sport, institutions), cohérents avec la cible 18-45 ans en France.
- Utilise la recherche web pour t'appuyer sur l'actualité réelle (événements, sorties, cérémonies, compétitions à venir) et cite les pages réellement consultées dans "sources". N'invente jamais de source, de personne, de fait ou de chiffre ; si tu n'es pas sûr, formule l'idée comme un profil de métier à rechercher plutôt que comme une personne nommée.
- Pas d'idée générique ni répétée : évite tout ce qui figure dans la liste « déjà proposé » et « déjà dans le CRM ».
- "actions" : 2 à 5 actions concrètes et immédiates (qui contacter, où chercher, quel format tester).
- Rédige en français, ton professionnel et chaleureux, phrases courtes.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
{"ideas":[{"title":"…","category":"…","description":"…","relevance":"…","interest":"…","actions":["…"],"sources":[{"title":"…","url":"https://…"}]}, {…}]}`;

function extractJSON(text: string) {
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Réponse de l'IA sans JSON exploitable.");
  return JSON.parse(text.slice(start, end + 1));
}

export type GenerationResult = { status: "succes" | "deja_fait" | "non_configure" | "erreur"; message: string };

/** Génère les deux idées du jour. Ne prétend jamais avoir généré si ce n'est pas le cas. */
export async function generateDailyIdeas(triggeredBy: string | null): Promise<GenerationResult> {
  const day = todayISO();
  if (!isAiConfigured()) return { status: "non_configure", message: "Aucune clé d'API IA configurée (ANTHROPIC_API_KEY)." };
  const existing = await db.select({ id: s.ideas.id }).from(s.ideas).where(eq(s.ideas.day, day));
  if (existing.length >= 2) return { status: "deja_fait", message: "Les deux idées du jour existent déjà." };
  const [running] = await db.select().from(s.ideaRuns).where(and(eq(s.ideaRuns.day, day), eq(s.ideaRuns.status, "en_cours"), gte(s.ideaRuns.createdAt, new Date(Date.now() - 10 * 60_000))));
  if (running) return { status: "deja_fait", message: "Une génération est déjà en cours." };
  const [runRow] = await db.insert(s.ideaRuns).values({ day, status: "en_cours", triggeredBy }).returning();

  try {
    const past = await db.select({ title: s.ideas.title }).from(s.ideas).where(gte(s.ideas.day, addDaysISO(day, -120))).orderBy(desc(s.ideas.day)).limit(120);
    const crm = await db.select({ f: s.contacts.firstName, l: s.contacts.lastName, p: s.contacts.profession }).from(s.contacts).limit(300);
    const user = `Nous sommes le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date())}.
Déjà proposé (à ne pas répéter) :\n${past.map((p) => `- ${p.title}`).join("\n") || "- (rien)"}
Déjà dans le CRM :\n${crm.map((c) => `- ${c.f} ${c.l}${c.p ? ` (${c.p})` : ""}`).join("\n") || "- (vide)"}
Propose les deux idées du jour.`;

    const client = new Anthropic();
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
    let final: Anthropic.Beta.BetaMessage | null = null;
    for (let i = 0; i < 4; i++) {
      const stream = client.beta.messages.stream({
        model: AI_MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "FR", city: "Paris", timezone: "Europe/Paris" } }],
        messages,
      });
      final = await stream.finalMessage();
      if (final.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: final.content });
    }
    if (!final) throw new Error("Aucune réponse de l'IA.");
    if (final.stop_reason === "refusal") throw new Error("L'IA a refusé la demande (aucune idée enregistrée).");
    if (final.stop_reason === "max_tokens") throw new Error("Réponse de l'IA tronquée (aucune idée enregistrée).");
    const text = final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
    const parsed = IdeaSchema.parse(extractJSON(text));
    // Ne conserve que les sources réellement renvoyées par la recherche web de cette réponse
    const seen = new Set<string>();
    for (const b of final.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if ("url" in r) seen.add(r.url);
      if (b.type === "text" && b.citations) for (const c of b.citations) if ("url" in c && typeof c.url === "string") seen.add(c.url);
    }
    const toInsert = parsed.ideas.slice(0, 2 - existing.length).map((x) => ({
      day, title: x.title, category: x.category, description: x.description, relevance: x.relevance, interest: x.interest, actions: x.actions,
      sources: x.sources.filter((src) => seen.has(src.url)), model: final!.model,
    }));
    await db.insert(s.ideas).values(toInsert);
    await db.update(s.ideaRuns).set({ status: "succes", message: `${toInsert.length} idée(s) générée(s) par ${final.model}` }).where(eq(s.ideaRuns.id, runRow.id));
    await notifyAll({ type: "idee", title: "Les idées du jour sont arrivées", body: toInsert.map((x) => x.title).join(" · "), link: "/idees", includeActor: true, dedupeKey: `idees:${day}` });
    return { status: "succes", message: `${toInsert.length} idée(s) générée(s)` };
  } catch (e) {
    const msg = e instanceof Anthropic.AuthenticationError ? "Clé d'API IA refusée (invalide ou révoquée)."
      : e instanceof Anthropic.RateLimitError ? "Limite de requêtes de l'API IA atteinte, réessayez plus tard."
      : e instanceof Anthropic.APIError ? `Erreur de l'API IA (${e.status ?? "?"}) : ${e.message.slice(0, 200)}`
      : (e as Error).message.slice(0, 300);
    await db.update(s.ideaRuns).set({ status: "erreur", message: msg }).where(eq(s.ideaRuns.id, runRow.id));
    return { status: "erreur", message: msg };
  }
}
