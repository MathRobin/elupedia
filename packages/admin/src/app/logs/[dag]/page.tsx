'use client';

/**
 * Runs d'un DAG (50 derniers, du plus récent au plus ancien) avec statut,
 * déclencheur et durée ; un clic ouvre le détail du run et ses journaux.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Anchor,
  Badge,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { RequireRole } from '@/components/RequireRole';
import { loadDagRuns } from '../actions';
import type { RunSummary } from '@/lib/dagu-logs';
import { formatDate } from '../../videos/status';
import { formatDuration, runStatusStyle } from '../status';

function DagRunsView() {
  const { dag } = useParams<{ dag: string }>();
  const [data, setData] = useState<{
    available: boolean;
    runs: RunSummary[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadDagRuns(dag).then(setData, (e: Error) => setError(e.message));
  }, [dag]);
  if (error) return <Alert color="red">{error}</Alert>;
  if (!data) return <Loader />;
  return (
    <Stack gap="lg">
      <Anchor href="/logs" size="sm">
        ← Tous les DAGs
      </Anchor>
      <Title order={2}>{dag}</Title>
      {data.available ? null : (
        <Alert color="yellow">
          Admin hébergée : journaux disponibles sur la machine d&apos;ingestion
          seulement.
        </Alert>
      )}
      <Paper withBorder p="md">
        {data.runs.length === 0 ? (
          <Text size="sm" c="dimmed">
            Aucun run.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Début</Table.Th>
                <Table.Th>Statut</Table.Th>
                <Table.Th>Déclencheur</Table.Th>
                <Table.Th>Durée</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.runs.map((r) => {
                const style = runStatusStyle(r.status);
                return (
                  <Table.Tr key={r.runId}>
                    <Table.Td>
                      <Anchor href={`/logs/${dag}/${r.runId}`}>
                        {formatDate(r.startedAt)}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={style.color} variant="light">
                        {style.symbol} {r.statusLabel}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{r.trigger}</Table.Td>
                    <Table.Td>{formatDuration(r.durationSec)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}

export default function DagRunsPage() {
  return (
    <RequireRole role="admin">
      <DagRunsView />
    </RequireRole>
  );
}
