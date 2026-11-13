'use client';

/**
 * Journaux Dagu : un DAG par ligne avec le statut de son dernier run ; un clic
 * mène à ses runs (/logs/<dag>) puis au détail d'un run (/logs/<dag>/<run>).
 * Admins seulement (RequireRole + actions serveur) ; machine d'ingestion seulement.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Code,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { RequireRole } from '@/components/RequireRole';
import { loadLogsOverview, type LogsOverview } from './actions';
import { formatDate } from '../videos/status';
import { formatDuration, runStatusStyle } from './status';

function LogsOverviewView() {
  const [data, setData] = useState<LogsOverview | null>(null);
  useEffect(() => {
    loadLogsOverview().then(setData);
  }, []);
  if (!data) return <Loader />;
  return (
    <Stack gap="lg">
      <Title order={2}>Journaux Dagu</Title>
      <Text size="sm" c="dimmed">
        Runs et sorties de chaque étape des DAGs de <Code>dagu-dags/</Code>, lus
        sur le disque de la machine d&apos;ingestion (<Code>DAGU_HOME</Code>).
      </Text>
      {data.available ? null : (
        <Alert color="yellow">
          Admin hébergée : les journaux sont écrits sur la machine
          d&apos;ingestion et ne sont pas visibles ici.
        </Alert>
      )}
      <Paper withBorder p="md">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>DAG</Table.Th>
              <Table.Th>Dernier run</Table.Th>
              <Table.Th>Statut</Table.Th>
              <Table.Th>Durée</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.dags.map((d) => {
              const style = d.lastRun ? runStatusStyle(d.lastRun.status) : null;
              return (
                <Table.Tr key={d.name}>
                  <Table.Td>
                    <Anchor href={`/logs/${d.name}`} fw={500}>
                      {d.description}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {d.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {d.lastRun ? formatDate(d.lastRun.startedAt) : '—'}
                  </Table.Td>
                  <Table.Td>
                    {d.lastRun && style ? (
                      <Badge color={style.color} variant="light">
                        {style.symbol} {d.lastRun.statusLabel}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">
                        aucun run
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {d.lastRun ? formatDuration(d.lastRun.durationSec) : '—'}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}

export default function LogsPage() {
  return (
    <RequireRole role="admin">
      <LogsOverviewView />
    </RequireRole>
  );
}
