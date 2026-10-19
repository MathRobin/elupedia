import { z } from 'zod';

/**
 * Script structuré d'un short, tel que produit par le modèle (sortie
 * structurée) puis relu par un humain avant rendu.
 *
 * Tous les champs sont obligatoires (ou `nullable`) : les sorties structurées
 * exigent un schéma strict sans champ optionnel.
 */

export const SCENE_KINDS = [
  'hook',
  'context',
  'result',
  'groups',
  'division',
  'outro',
] as const;

export const SCENE_VISUALS = [
  'title',
  'hemicycle',
  'bars',
  'group_focus',
  'source',
  'chart',
] as const;

export const sceneSchema = z.object({
  id: z.string().describe('Identifiant court et unique, ex. "s1"'),
  kind: z.enum(SCENE_KINDS),
  durationSec: z
    .number()
    .int()
    .min(3)
    .max(15)
    .describe('Durée de la scène en secondes'),
  voiceover: z
    .string()
    .describe('Texte lu par la voix off, phrases courtes, ton posé'),
  onScreenText: z
    .string()
    .describe(
      "Texte affiché à l'écran (titre, chiffre clé), très court, peut être vide",
    ),
  visual: z.enum(SCENE_VISUALS),
  chart: z
    .string()
    .nullable()
    .describe(
      'Identifiant du graphique (facts.topic.charts) pour le visuel « chart », sinon null',
    ),
  lowerThird: z
    .object({
      name: z.string(),
      role: z.string(),
    })
    .nullable()
    .describe(
      "Bandeau nom (style JT) si une personne ou un groupe est mis à l'image, sinon null",
    ),
});

export const shortScriptSchema = z.object({
  title: z.string().describe('Titre YouTube, factuel, 60 caractères max'),
  scenes: z.array(sceneSchema).min(4).max(8),
  description: z
    .string()
    .describe('Description YouTube : 2 à 3 phrases factuelles puis la source'),
  hashtags: z.array(z.string()).min(3).max(6),
});

export type Scene = z.infer<typeof sceneSchema>;
export type ShortScript = z.infer<typeof shortScriptSchema>;
