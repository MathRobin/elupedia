import { describe, it, expect } from 'vitest';
import {
  describePlan,
  planMake,
  type MakeFlags,
  type MakeState,
} from './make.js';

const flags: MakeFlags = {
  rescript: false,
  reimport: false,
  force: false,
  silent: false,
};
const ready: MakeState = {
  hasScript: true,
  voiceImportedAt: 1000,
  missingTakes: [],
  latestTakeAt: 900,
  hasVideo: true,
};

describe('planMake', () => {
  it('does nothing when everything is up to date', () => {
    const p = planMake(ready, flags);
    expect(p).toMatchObject({
      script: false,
      importVoice: false,
      needTakes: false,
      render: false,
    });
  });

  it('imports and renders when takes are complete but the voice is not imported', () => {
    const p = planMake(
      { ...ready, voiceImportedAt: null, hasVideo: false },
      flags,
    );
    expect(p).toMatchObject({
      importVoice: true,
      render: true,
      needTakes: false,
    });
  });

  it('re-imports and re-renders when a take is newer than the import', () => {
    const p = planMake({ ...ready, latestTakeAt: 2000 }, flags);
    expect(p).toMatchObject({ importVoice: true, render: true });
    expect(p.reasons.join(' ')).toContain('plus récentes');
  });

  it('stops and asks for takes when they are missing and no voice exists', () => {
    const p = planMake(
      {
        ...ready,
        voiceImportedAt: null,
        missingTakes: ['s1', 's2'],
        latestTakeAt: null,
        hasVideo: false,
      },
      flags,
    );
    expect(p).toMatchObject({
      needTakes: true,
      importVoice: false,
      render: false,
    });
  });

  it('renders mute with --silent instead of stopping', () => {
    const p = planMake(
      {
        ...ready,
        voiceImportedAt: null,
        missingTakes: ['s1'],
        latestTakeAt: null,
        hasVideo: false,
      },
      { ...flags, silent: true },
    );
    expect(p).toMatchObject({
      needTakes: false,
      importVoice: false,
      render: true,
    });
  });

  it('a new script invalidates the existing voice', () => {
    const p = planMake({ ...ready, hasScript: false }, flags);
    expect(p.script).toBe(true);
    // la voix en base ne vaut plus ; ici les prises sont complètes → réimport
    expect(p).toMatchObject({ importVoice: true, render: true });
    const missing = planMake(
      { ...ready, hasScript: false, missingTakes: ['s1'] },
      flags,
    );
    expect(missing.needTakes).toBe(true);
  });

  it('--force renders even when nothing changed, --reimport reimports', () => {
    expect(planMake(ready, { ...flags, force: true }).render).toBe(true);
    expect(planMake(ready, { ...flags, reimport: true })).toMatchObject({
      importVoice: true,
      render: true,
    });
  });

  it('describes a stop for missing takes instead of « nothing to do »', () => {
    const stop = planMake(
      {
        ...ready,
        voiceImportedAt: null,
        missingTakes: ['s1'],
        latestTakeAt: null,
        hasVideo: false,
      },
      flags,
    );
    expect(describePlan(stop)).toContain('prises de voix manquantes');
    expect(describePlan(planMake(ready, flags))).toContain('déjà à jour');
  });
});
