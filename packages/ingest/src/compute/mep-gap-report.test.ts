/**
 * Tests de buildMepGapReport et formatMepGapReport : agrégation des compteurs,
 * mandat sans identifiant europarl listé en anomalie, vote sans signature
 * listé en anomalie, fenêtre trop pauvre en scrutins. Données fictives,
 * aucun appel réseau ni base.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMepGapReport,
  formatMepGapReport,
  type MepGapInput,
  type MepGapInputs,
} from './mep-gap-report.js';

/** 12 jours de scrutin : au-dessus de MIN_ROLLCALL_DAYS (10). */
const ROLLCALL_DAYS = [
  '2024-10-21',
  '2024-10-22',
  '2024-10-23',
  '2024-10-24',
  '2024-11-13',
  '2024-11-14',
  '2024-11-25',
  '2024-11-26',
  '2024-11-27',
  '2024-11-28',
  '2024-12-17',
  '2024-12-18',
];

const OPEN_WINDOW = { start: '2024-07-16', end: null };

function mep(overrides: Partial<MepGapInput> = {}): MepGapInput {
  return {
    officialId: 'official-1',
    name: 'Ada Martin',
    europarlId: '900001',
    window: OPEN_WINDOW,
    signedDates: [],
    votedDates: [],
    ...overrides,
  };
}

function inputs(meps: MepGapInput[]): MepGapInputs {
  return { rollcallDays: ROLLCALL_DAYS, meps };
}

describe('buildMepGapReport', () => {
  it('counts the two gaps of an MEP', () => {
    const report = buildMepGapReport(
      inputs([
        mep({
          // Signe 3 jours, n'exprime une position que sur 2 : 1 jour signé
          // sans vote, et 9 jours de scrutin sans signature.
          signedDates: ['2024-10-21', '2024-10-22', '2024-10-23'],
          votedDates: ['2024-10-21', '2024-10-22'],
        }),
      ]),
    );

    expect(report.rollcallDays).toBe(12);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      name: 'Ada Martin',
      europarlId: '900001',
      rollcallDays: 12,
      daysWithoutSignature: 9,
      signedDaysWithoutVote: 1,
      insufficientData: false,
    });
    expect(report.anomalies).toEqual([]);
    expect(report.unmatched).toEqual([]);
  });

  it('lists a mandate without an europarl id instead of computing it', () => {
    const report = buildMepGapReport(
      inputs([
        mep({ europarlId: null, name: 'Sans Identifiant' }),
        mep({ officialId: 'official-2', name: 'Ada Martin' }),
      ]),
    );

    expect(report.unmatched).toEqual([
      { officialId: 'official-1', name: 'Sans Identifiant' },
    ]);
    expect(report.rows.map((row) => row.name)).toEqual(['Ada Martin']);
  });

  it('reports a vote recorded on a day without signature', () => {
    const report = buildMepGapReport(
      inputs([mep({ signedDates: [], votedDates: ['2024-10-23'] })]),
    );

    expect(report.anomalies).toEqual([
      { name: 'Ada Martin', dates: ['2024-10-23'] },
    ]);
    // L'anomalie ne compte pas comme une absence.
    expect(report.rows[0].daysWithoutSignature).toBe(11);
  });

  it('flags a window with too few rollcall days', () => {
    const report = buildMepGapReport({
      rollcallDays: ROLLCALL_DAYS,
      meps: [mep({ window: { start: '2024-12-17', end: null } })],
    });

    expect(report.rows[0]).toMatchObject({
      rollcallDays: 2,
      insufficientData: true,
    });
    expect(report.insufficientData).toEqual([
      { name: 'Ada Martin', rollcallDays: 2 },
    ]);
  });
});

describe('formatMepGapReport', () => {
  it('writes one line per anomaly', () => {
    const report = buildMepGapReport(
      inputs([
        mep({ europarlId: null, name: 'Sans Identifiant' }),
        mep({
          officialId: 'official-2',
          name: 'Ada Martin',
          votedDates: ['2024-10-23'],
        }),
      ]),
    );

    expect(formatMepGapReport(report)).toEqual([
      '  1 mandats calculés sur 12 jours de scrutin nominatif connus en base (toutes législatures ; chaque mandat ne compte que ceux de sa fenêtre)',
      "  anomalie : Sans Identifiant (official-1) n'a pas d'identifiant europarl, mandat exclu du calcul",
      '  anomalie : Ada Martin a voté sans signature le 2024-10-23',
    ]);
  });
});
