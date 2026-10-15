import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNull } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import { loadShortFacts, type ShortFacts } from './script-facts.js';
import { shortScriptSchema, type ShortScript } from './script-schema.js';
import { validateScript, type ValidationIssue } from './script-validate.js';

/**
 * Génération du script d'un short par le modèle, à partir des seuls faits de
 * la base (`script-facts.ts`), puis validation mécanique (`script-validate.ts`).
 * En cas d'écart, une seconde passe renvoie les problèmes au modèle (historique
 * conservé tel quel, ajout en fin seulement). Au-delà, le short est laissé en
 * `candidate` avec les problèmes dans `notes` pour relecture humaine.
 */

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const MAX_ATTEMPTS = 2;

/**
 * Système figé (mis en cache côté API) : ligne éditoriale et format. Les faits
 * du scrutin, variables, vont dans le message utilisateur.
 */
export const SYSTEM_PROMPT = `Tu écris le script d'une vidéo verticale courte (YouTube Shorts, 45 à 60 secondes) qui présente un scrutin récent du Parlement français. Le ton est celui d'une émission de décryptage posée, à la manière du « Dessous des cartes » : voix calme, phrases courtes, aucun jugement.

Règles éditoriales, non négociables :
- Tu décris, tu ne qualifies pas. Aucun adjectif ou adverbe évaluatif sur le texte voté, les groupes, le Gouvernement ou le résultat. Pas de « enfin », « historique », « camouflet », « victoire », etc.
- Tout ce que tu écris doit provenir des faits fournis. Aucun chiffre, aucun nom, aucune date, aucune cause ou conséquence qui n'y figure pas. Si un élément manque, tu ne l'inventes pas : tu t'en passes.
- Tu ne dis pas ce que le texte « va changer » ni pourquoi les groupes ont voté ainsi : les faits ne le disent pas.
- Tu traites les groupes de façon symétrique : même formulation pour tous, sans en isoler ni en commenter un en particulier. Le détail des voix est donné pour tous les groupes à la fois par l'écran, pas par la voix.
- Les nombres s'écrivent en chiffres (« 280 voix »), les pourcentages fournis peuvent être cités tels quels.
- Vocabulaire officiel : « adopté » / « rejeté », « pour » / « contre » / « abstention », « scrutin », « groupe ».
- À voix haute, les groupes se disent comme groups[].spokenName l'indique : le nom complet, sauf LFI-NFP et LIOT qui se prononcent et se disent par leur sigle. Jamais les autres sigles (SOC, HOR, GDR, EPR, RN, DR…) : ils sont réservés à l'écran. Une scène qui nomme beaucoup de groupes reste lisible en regroupant par position plutôt qu'en les énumérant tous.
- Le résultat officiel (result) est toujours énoncé en toutes lettres dans la voix : « Le texte est adopté. » ou « Le texte est rejeté. ». Si result est absent des faits, ne rien dire du résultat.

Structure attendue (4 à 6 scènes, 35 à 60 secondes au total, 2,6 mots par seconde maximum) :
1. hook : une phrase d'accroche factuelle (ce qui a été voté, où, quand). Visuel « title ».
2. context : ce sur quoi portait précisément le scrutin, d'après son intitulé, avec le jour et la date (weekday, dateLabel) et la mention « en séance publique » ; si proposers n'est pas vide, qui a déposé le texte (nom et groupe, tels que fournis) ; si requestedBy est renseigné, une phrase distincte « scrutin public demandé par … » — jamais présenté comme l'auteur du texte. L'heure du scrutin n'est pas publiée : ne jamais en donner une. Si proposers est vide, ne rien dire de l'auteur. Visuel « title » ou « hemicycle ».
3. result : le résultat énoncé (« Le texte est adopté/rejeté »), puis les voix (pour, contre, abstention), puis la participation : « X députés sur Y n'ont pas pris part au vote » (counts.notVoting sur counts.seats). Toujours la donner : un scrutin public ordinaire se tient avec les présents, souvent une moitié de l'assemblée, et le taire donnerait une image trompeuse du vote. Visuel « hemicycle ».
4. groups : la position majoritaire des groupes, cités par position (ceux qui ont voté pour, ceux qui ont voté contre, ceux qui se sont abstenus), chaque groupe nommé une fois au plus, puis une phrase indiquant que le détail des voix de chaque groupe s'affiche — pour, contre, abstention et membres n'ayant pas pris part au vote. Visuel « bars » : l'écran montre d'abord la position de chaque groupe puis se transforme en détail des voix de tous les groupes avec le même code couleur ; aucun groupe n'est isolé ni commenté à part. Prévoir 12 à 15 secondes.
5. outro : où retrouver le vote de chaque élu. Visuel « source », onScreenText = l'URL fournie.
Les genres « division » et le visuel « group_focus » ne sont plus utilisés.

lowerThird : renseigné uniquement quand une scène met un groupe ou une personne à l'image (name = libellé exact fourni, sinon rejeté). Pour l'auteur du texte (proposers), sur la scène qui le cite : name = son nom exact, role = « Auteur·rice du texte · » suivi de son groupe ; sa photo s'affiche alors automatiquement. Pour un groupe : role = « Groupe à l'Assemblée nationale » ou « Groupe au Sénat ». Sinon null.
onScreenText : très court (un chiffre, un mot-clé), vide si rien d'utile.
title : titre YouTube factuel, 70 caractères maximum, pas de point d'exclamation.
description : 2 à 3 phrases factuelles, puis « Source : Elupedia — » suivi de l'URL fournie, puis la mention « Données : Assemblée nationale / Sénat, licence ouverte ».
hashtags : 3 à 6, sans espace, dont #Elupedia.`;

export interface GenerationResult {
  script: ShortScript;
  attempts: number;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelCall {
  (
    messages: Anthropic.Beta.BetaMessageParam[],
    model: string,
  ): Promise<{
    script: ShortScript | null;
    content: Anthropic.Beta.BetaContentBlock[];
    stopReason: string | null;
    usage: { inputTokens: number; outputTokens: number };
  }>;
}

export function createModelCall(client: Anthropic): ModelCall {
  return async (messages, model) => {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'high',
        format: zodOutputFormat(shortScriptSchema),
      },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    });
    return {
      script: response.parsed_output ?? null,
      content: response.content,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  };
}

export function factsMessage(facts: ShortFacts): string {
  return [
    'Voici les faits du ou des scrutrins à présenter, au format JSON. Écris le script.',
    '',
    JSON.stringify(facts, null, 2),
  ].join('\n');
}

export function issuesMessage(issues: ValidationIssue[]): string {
  return [
    'Le script ne passe pas la vérification automatique. Corrige uniquement les points suivants, sans rien ajouter qui ne figure pas dans les faits :',
    ...issues.map((i) => `- ${i.message}`),
  ].join('\n');
}

export async function generateScript(
  facts: ShortFacts,
  callModel: ModelCall,
  model: string = DEFAULT_MODEL,
): Promise<
  | { ok: true; result: GenerationResult }
  | { ok: false; issues: ValidationIssue[]; attempts: number; reason: string }
> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: factsMessage(facts) },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let lastIssues: ValidationIssue[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await callModel(messages, model);
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;

    if (response.stopReason === 'refusal') {
      return {
        ok: false,
        issues: lastIssues,
        attempts: attempt,
        reason: 'Le modèle a refusé la requête (stop_reason = refusal)',
      };
    }
    if (!response.script) {
      return {
        ok: false,
        issues: lastIssues,
        attempts: attempt,
        reason: `Sortie structurée illisible (stop_reason = ${response.stopReason})`,
      };
    }

    lastIssues = validateScript(response.script, facts);
    if (lastIssues.length === 0) {
      return {
        ok: true,
        result: { script: response.script, attempts: attempt, model, usage },
      };
    }
    logger.warn(
      `Tentative ${attempt}/${MAX_ATTEMPTS} : ${lastIssues.length} problème(s) — ${lastIssues.map((i) => i.message).join(' ; ')}`,
    );
    // Historique en ajout seul : la réponse du modèle est renvoyée telle quelle.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: issuesMessage(lastIssues) });
  }

  return {
    ok: false,
    issues: lastIssues,
    attempts: MAX_ATTEMPTS,
    reason: `Script non conforme après ${MAX_ATTEMPTS} tentatives`,
  };
}

export interface ScriptOptions {
  /** Identifiant d'un short précis ; sinon tous les `candidate` sans script. */
  shortId?: string;
  /** Regénère même si un script existe déjà. */
  force: boolean;
  /** Affiche sans écrire en base. */
  dryRun: boolean;
  model: string;
}

export interface StoredScript {
  version: 1;
  generatedAt: string;
  model: string;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
  facts: ShortFacts;
  script: ShortScript;
}

export async function generateScriptsForShorts(
  db: NeonHttpDatabase,
  callModel: ModelCall,
  options: ScriptOptions,
): Promise<{ generated: string[]; failed: string[] }> {
  const generated: string[] = [];
  const failed: string[] = [];

  const targets = options.shortId
    ? await db
        .select({ id: videoShorts.id, status: videoShorts.status })
        .from(videoShorts)
        .where(eq(videoShorts.id, options.shortId))
    : await db
        .select({ id: videoShorts.id, status: videoShorts.status })
        .from(videoShorts)
        .where(
          options.force
            ? eq(videoShorts.status, 'candidate')
            : and(
                eq(videoShorts.status, 'candidate'),
                isNull(videoShorts.script),
              ),
        );

  if (options.shortId && targets.length === 0) {
    throw new Error(`video_short ${options.shortId} introuvable`);
  }
  logger.info(`${targets.length} short(s) à scripter`);

  for (const target of targets) {
    const facts = await loadShortFacts(db, target.id);
    const outcome = await generateScript(facts, callModel, options.model);

    if (!outcome.ok) {
      failed.push(target.id);
      const note = [
        `[script] ${outcome.reason}`,
        ...outcome.issues.map((i) => `- ${i.message}`),
      ].join('\n');
      logger.error(`short ${target.id} : ${outcome.reason}`);
      if (!options.dryRun) {
        await db
          .update(videoShorts)
          .set({ notes: note, updatedAt: new Date() })
          .where(eq(videoShorts.id, target.id));
      }
      continue;
    }

    const stored: StoredScript = {
      version: 1,
      generatedAt: new Date().toISOString(),
      model: outcome.result.model,
      attempts: outcome.result.attempts,
      usage: outcome.result.usage,
      facts,
      script: outcome.result.script,
    };
    logger.info(
      `short ${target.id} : script généré en ${outcome.result.attempts} tentative(s), ${outcome.result.usage.inputTokens} tokens en entrée, ${outcome.result.usage.outputTokens} en sortie`,
    );
    if (options.dryRun) {
      console.log(JSON.stringify(outcome.result.script, null, 2));
    } else {
      await db
        .update(videoShorts)
        .set({
          script: stored,
          status: 'draft',
          notes: null,
          updatedAt: new Date(),
        })
        .where(eq(videoShorts.id, target.id));
    }
    generated.push(target.id);
  }

  return { generated, failed };
}
