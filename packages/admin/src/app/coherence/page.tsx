'use client';

/** Contrôles de cohérence : lancement à la demande, résultats par contrôle avec échantillons. */
import { useState } from 'react';
import {
  Accordion,
  Badge,
  Button,
  Code,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { runCoherence, type CoherenceView } from './actions';
import { formatDate } from '../videos/status';

export default function CoherencePage() {
  const [view, setView] = useState<CoherenceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setView(await runCoherence());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Cohérence des données</Title>
        <Button onClick={run} loading={busy}>
          Lancer les contrôles
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Même chose que <Code>yarn --cwd packages/ingest check:coherence</Code> :
        mandats qui se recoupent, parrainages sans mandat couvrant, etc. Lecture
        seule, quelques secondes.
      </Text>
      {error ? <Text c="red">{error}</Text> : null}
      {view ? (
        <>
          <Text size="sm">
            Lancé le {formatDate(view.ranAt)} en{' '}
            {(view.durationMs / 1000).toFixed(1)} s :{' '}
            <strong>{view.totalIssues}</strong> anomalie(s) sur{' '}
            {view.results.length} contrôle(s).
          </Text>
          <Accordion
            multiple
            defaultValue={view.results
              .filter((r) => r.count > 0)
              .map((r) => r.key)}
          >
            {view.results.map((r) => (
              <Accordion.Item key={r.key} value={r.key}>
                <Accordion.Control>
                  <Group gap="sm">
                    <Badge
                      color={r.count > 0 ? 'red' : 'green'}
                      variant="light"
                    >
                      {r.count}
                      {r.truncated ? '+' : ''}
                    </Badge>
                    <Text size="sm">{r.description}</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {r.samples.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Rien à signaler.
                    </Text>
                  ) : (
                    <Code
                      block
                      style={{
                        whiteSpace: 'pre-wrap',
                        maxHeight: 320,
                        overflow: 'auto',
                      }}
                    >
                      {r.samples.join('\n')}
                    </Code>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </>
      ) : null}
    </Stack>
  );
}
