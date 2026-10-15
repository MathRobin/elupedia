/**
 * Enveloppe de `FranceDepartmentMap` qui porte l'état « département
 * sélectionné » pour la page d'un scrutin.
 *
 * Rendu sur `pages/scrutins/[id].astro` avec `client:load` : la carte est
 * purement interactive (survol, clic), il faut donc l'hydrater dès l'arrivée.
 * La sélection n'est pas consommée ici : `FranceDepartmentMap` la diffuse via
 * l'événement DOM `dept-filter`, écouté par un script inline de la page pour
 * filtrer la liste nominative des votes.
 */
import { useState } from 'react';
import FranceDepartmentMap from './FranceDepartmentMap.js';

type DepartmentVotes = {
  for: number;
  against: number;
  abstain: number;
  absent: number;
};

/** Props injectées par la page Astro (sérialisées, donc sans fonctions). */
type Props = {
  /** Décompte des positions par code INSEE de département. */
  votesByDept: Record<string, DepartmentVotes>;
  /** Nom affichable de chaque département, par code INSEE. */
  deptNames: Record<string, string>;
};

export default function DepartmentMapWrapper({
  votesByDept,
  deptNames,
}: Props) {
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  return (
    <FranceDepartmentMap
      votesByDept={votesByDept}
      deptNames={deptNames}
      selectedDept={selectedDept}
      onSelect={setSelectedDept}
    />
  );
}
