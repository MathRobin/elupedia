/**
 * Tests de computeMepGap : compteurs sur la fenêtre de mandat, cas limites
 * (jamais signé, signé sans vote, vote sans signature, dates hors mandat).
 * Données fictives, aucun appel réseau.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMepGap,
  MIN_ROLLCALL_DAYS,
  type MepDays,
} from './attendance-gap.js';

const OPEN_MANDATE = { start: '2024-07-16', end: null };

// Jours de scrutin nominatif fictifs, tous dans le mandat.
const ROLLCALL = ['2024-09-16', '2024-10-14', '2024-11-19', '2024-12-17'];

function mep(overrides: Partial<MepDays> = {}): MepDays {
  return {
    officialId: 'mep-1',
    window: OPEN_MANDATE,
    signedDates: [],
    votedDates: [],
    ...overrides,
  };
}

describe('computeMepGap', () => {
  it('ne signe jamais : tous les jours de scrutin sont sans signature', () => {
    const gap = computeMepGap(ROLLCALL, mep());
    expect(gap.rollcallDays).toBe(4);
    expect(gap.daysWithoutSignature).toBe(4);
    expect(gap.signedDaysWithoutVote).toBe(0);
    expect(gap.anomalies).toEqual([]);
  });

  it('signe chaque jour sans voter : tous les jours signés sont sans vote', () => {
    const gap = computeMepGap(ROLLCALL, mep({ signedDates: ROLLCALL }));
    expect(gap.daysWithoutSignature).toBe(0);
    expect(gap.signedDaysWithoutVote).toBe(4);
    expect(gap.anomalies).toEqual([]);
  });

  it('signe et vote chaque jour : aucun compteur', () => {
    const gap = computeMepGap(
      ROLLCALL,
      mep({ signedDates: ROLLCALL, votedDates: ROLLCALL }),
    );
    expect(gap.daysWithoutSignature).toBe(0);
    expect(gap.signedDaysWithoutVote).toBe(0);
  });

  it('un jour signé sans scrutin nominatif n’entre pas dans les compteurs', () => {
    const gap = computeMepGap(ROLLCALL, mep({ signedDates: ['2024-09-17'] }));
    expect(gap.signedDaysWithoutRollcall).toBe(1);
    expect(gap.signedDaysWithoutVote).toBe(0);
    expect(gap.daysWithoutSignature).toBe(4);
  });

  it('un vote sans signature est une anomalie, pas une absence', () => {
    const gap = computeMepGap(
      ROLLCALL,
      mep({ signedDates: ['2024-09-16'], votedDates: ['2024-10-14'] }),
    );
    expect(gap.anomalies).toEqual(['2024-10-14']);
    // 2024-10-14 est exclu du compteur « sans signature » ; restent 11-19 et 12-17.
    expect(gap.daysWithoutSignature).toBe(2);
    expect(gap.signedDaysWithoutVote).toBe(1);
  });

  it('ignore les dates hors fenêtre de mandat', () => {
    const gap = computeMepGap(
      [...ROLLCALL, '2024-06-17'],
      mep({
        window: { start: '2024-07-16', end: '2024-11-30' },
        signedDates: ['2024-06-17', '2024-12-17'],
        votedDates: ['2024-12-17'],
      }),
    );
    // Hors fenêtre : 2024-06-17 (avant), 2024-12-17 (après la fin du mandat).
    expect(gap.rollcallDays).toBe(3);
    expect(gap.daysWithoutSignature).toBe(3);
    expect(gap.signedDaysWithoutRollcall).toBe(0);
    expect(gap.anomalies).toEqual([]);
  });

  it('un mandat ouvert (end = null) compte les jours jusqu’à aujourd’hui', () => {
    const gap = computeMepGap(
      ['2025-01-20', '2030-01-01'],
      mep({ window: { start: '2024-07-16', end: null } }),
    );
    expect(gap.rollcallDays).toBe(2);
  });

  it('dédoublonne les dates répétées', () => {
    const gap = computeMepGap(
      [...ROLLCALL, ROLLCALL[0]],
      mep({ signedDates: [ROLLCALL[0], ROLLCALL[0]] }),
    );
    expect(gap.rollcallDays).toBe(4);
    expect(gap.daysWithoutSignature).toBe(3);
  });

  it('marque insufficientData sous le seuil de jours de scrutin, sans toucher aux compteurs', () => {
    const few = ROLLCALL.slice(0, MIN_ROLLCALL_DAYS - 1);
    expect(computeMepGap(few, mep()).insufficientData).toBe(true);

    const enough = Array.from(
      { length: MIN_ROLLCALL_DAYS },
      (_, i) => `2024-09-${String(i + 1).padStart(2, '0')}`,
    );
    const gap = computeMepGap(enough, mep());
    expect(gap.insufficientData).toBe(false);
    expect(gap.daysWithoutSignature).toBe(MIN_ROLLCALL_DAYS);
  });

  it('rejette une date ISO invalide', () => {
    expect(() => computeMepGap(['2024-02-30'], mep())).toThrow(/ISO/);
    expect(() => computeMepGap(['16/09/2024'], mep())).toThrow(/ISO/);
    expect(() =>
      computeMepGap(ROLLCALL, mep({ signedDates: ['pas-une-date'] })),
    ).toThrow(/ISO/);
  });

  it('rejette une fin de mandat antérieure au début', () => {
    expect(() =>
      computeMepGap(
        ROLLCALL,
        mep({ window: { start: '2024-07-16', end: '2024-07-01' } }),
      ),
    ).toThrow(/antérieure/);
  });
});
