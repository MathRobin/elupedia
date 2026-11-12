'use client';

/**
 * Détail d'un run Dagu : étapes (statut, durée, erreur) et visionneuse de
 * journal (journal du run, sortie ou erreurs d'une étape, fin du fichier).
 * À l'ouverture, l'étape échouée est sélectionnée, sinon le journal du run ;
 * un run en cours se rafraîchit toutes les 5 s.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Grid,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { RequireRole } from '@/components/RequireRole';
import { loadRunDetail, loadRunLog } from '../../actions';
import type { LogContent, LogTarget, RunDetail } from '@/lib/dagu-logs';
import { formatDate } from '../../../videos/status';
import {
  formatDuration,
  isActive,
  runStatusStyle,
  stepStatusStyle,
} from '../../status';

type Selection = { kind: 'run' } | { kind: 'step'; step: string };

function stepDuration(start: string | null, end: string | null): number | null {
  return start && end
    ? Math.max(
        0,
        Math.round(
          (new Date(end).getTime() - new Date(start).getTime()) / 1000,
        ),
      )
    : null;
}

function RunView() {
  const { dag, run } = useParams<{ dag: string; run: string }>();
  const [detail, setDetail] = useState<RunDetail | null | undefined>(undefined);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [stream, setStream] = useState<'out' | 'err'>('out');
  const [log, setLog] = useState<LogContent | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const reloadDetail = useCallback(() => {
    loadRunDetail(dag, run).then(setDetail, (e: Error) => setError(e.message));
  }, [dag, run]);

  useEffect(() => {
    reloadDetail();
  }, [reloadDetail]);

  // Sélection initiale : première étape échouée, sinon journal du run.
  useEffect(() => {
    if (!detail || selection) return;
    const failed = detail.steps.find((s) => s.status === 2);
    setSelection(
      failed ? { kind: 'step', step: failed.name } : { kind: 'run' },
    );
    if (failed && !failed.hasStderr) setStream('out');
  }, [detail, selection]);

  const reloadLog = useCallback(() => {
    if (!selection) return;
    const target: LogTarget =
      selection.kind === 'run'
        ? { kind: 'run' }
        : { kind: 'step', step: selection.step, stream };
    loadRunLog(dag, run, target).then(setLog, (e: Error) =>
      setError(e.message),
    );
  }, [dag, run, selection, stream]);

  useEffect(() => {
    setLog(undefined);
    reloadLog();
  }, [reloadLog]);

  const active = detail ? isActive(detail.status) : false;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      reloadDetail();
      reloadLog();
    }, 5000);
    return () => clearInterval(t);
  }, [active, reloadDetail, reloadLog]);

  if (error) return <Alert color="red">{error}</Alert>;
  if (detail === undefined) return <Loader />;
  if (detail === null)
    return (
      <Alert color="yellow">
        Run introuvable (ou admin hébergée : journaux sur la machine
        d&apos;ingestion).
      </Alert>
    );

  const style = runStatusStyle(detail.status);
  return (
    <Stack gap="lg">
      <Anchor href={`/logs/${dag}`} size="sm">
        ← Runs de {dag}
      </Anchor>
      <Group>
        <Title order={2}>{formatDate(detail.startedAt)}</Title>
        <Badge color={style.color} variant="light" size="lg">
          {style.symbol} {detail.statusLabel}
        </Badge>
        <Text size="sm" c="dimmed">
          {detail.trigger} · {formatDuration(detail.durationSec)}
        </Text>
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder p="md">
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Étape</Table.Th>
                  <Table.Th>Statut</Table.Th>
                  <Table.Th>Durée</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detail.hasRunLog ? (
                  <Table.Tr
                    style={{ cursor: 'pointer' }}
                    bg={
                      selection?.kind === 'run'
                        ? 'var(--mantine-color-default-hover)'
                        : undefined
                    }
                    onClick={() => setSelection({ kind: 'run' })}
                  >
                    <Table.Td colSpan={3}>
                      <Text fw={500}>Journal du run</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
                {detail.steps.map((s) => {
                  const st = stepStatusStyle(s.status);
                  const selected =
                    selection?.kind === 'step' && selection.step === s.name;
                  return (
                    <Table.Tr
                      key={s.name}
                      style={{ cursor: 'pointer' }}
                      bg={
                        selected
                          ? 'var(--mantine-color-default-hover)'
                          : undefined
                      }
                      onClick={() =>
                        setSelection({ kind: 'step', step: s.name })
                      }
                    >
                      <Table.Td>
                        <Text size="sm" fw={selected ? 600 : 400}>
                          {s.name}
                        </Text>
                        {s.error ? (
                          <Text size="xs" c="red">
                            {s.error}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={st.color} variant="light" size="sm">
                          {st.symbol} {s.statusLabel}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {formatDuration(
                          stepDuration(s.startedAt, s.finishedAt),
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Text fw={500}>
                {selection?.kind === 'step' ? selection.step : 'Journal du run'}
              </Text>
              <Group gap="xs">
                {selection?.kind === 'step' ? (
                  <SegmentedControl
                    size="xs"
                    value={stream}
                    onChange={(v) => setStream(v as 'out' | 'err')}
                    data={[
                      { label: 'Sortie', value: 'out' },
                      { label: 'Erreurs', value: 'err' },
                    ]}
                  />
                ) : null}
                <Button size="xs" variant="light" onClick={reloadLog}>
                  Actualiser
                </Button>
              </Group>
            </Group>
            {log === undefined ? (
              <Loader size="sm" />
            ) : log === null ? (
              <Text size="sm" c="dimmed">
                Pas de journal pour cette sélection.
              </Text>
            ) : (
              <>
                {log.truncated ? (
                  <Text size="xs" c="orange" mb="xs">
                    Fichier de {Math.round(log.size / 1024)} Ko : seule la fin
                    est affichée.
                  </Text>
                ) : null}
                <Code
                  block
                  style={{
                    maxHeight: 600,
                    overflow: 'auto',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {log.content || '(vide)'}
                </Code>
              </>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

export default function RunPage() {
  return (
    <RequireRole role="admin">
      <RunView />
    </RequireRole>
  );
}
