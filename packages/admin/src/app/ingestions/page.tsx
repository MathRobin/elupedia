'use client';

/** Tableau de bord des ingestions : DAGs planifiés et derniers rapports de run. */
import { useEffect, useState } from 'react';
import {
  Badge,
  Code,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { loadIngestionsDashboard, type IngestionsDashboard } from './actions';
import { formatDate } from '../videos/status';

export default function IngestionsPage() {
  const [data, setData] = useState<IngestionsDashboard | null>(null);
  useEffect(() => {
    loadIngestionsDashboard().then(setData);
  }, []);
  if (!data) return <Loader />;

  const reportByKey = new Map(data.reports.map((r) => [r.key, r]));
  const used = new Set<string>();
  const ageDays = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  return (
    <Stack gap="lg">
      <Title order={2}>Ingestions</Title>
      <Text size="sm" c="dimmed">
        DAGs lus dans <Code>{data.dagsDir}</Code>, rapports de fin de run dans{' '}
        <Code>{data.reportsDir}</Code>. La date d&apos;un rapport est celle de
        la fin du dernier run de la commande, planifié ou lancé à la main.
        L&apos;état en direct de Dagu n&apos;est pas remonté (API locale
        authentifiée).
      </Text>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          DAGs planifiés
        </Title>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>DAG</Table.Th>
              <Table.Th>Planification</Table.Th>
              <Table.Th>Commandes</Table.Th>
              <Table.Th>Dernier rapport</Table.Th>
              <Table.Th>Résultat</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.dags.map((d) => {
              const reports = d.reportKeys
                .map((k) => reportByKey.get(k))
                .filter((r): r is NonNullable<typeof r> => Boolean(r));
              reports.forEach((r) => used.add(r.key));
              const latest = reports.sort((a, b) =>
                b.writtenAt.localeCompare(a.writtenAt),
              )[0];
              return (
                <Table.Tr key={d.file}>
                  <Table.Td>
                    <Text fw={500}>{d.name}</Text>
                    <Text size="xs" c="dimmed">
                      {d.file}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{d.scheduleLabel}</Text>
                    {d.schedule ? (
                      <Text size="xs" c="dimmed">
                        {d.schedule}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    {d.commands.map((c) => (
                      <Code key={c} block style={{ fontSize: 11 }}>
                        {c}
                      </Code>
                    ))}
                  </Table.Td>
                  <Table.Td>
                    {latest ? (
                      <>
                        <Text size="sm">{formatDate(latest.writtenAt)}</Text>
                        <Text
                          size="xs"
                          c={
                            ageDays(latest.writtenAt) > 14 ? 'orange' : 'dimmed'
                          }
                        >
                          il y a {ageDays(latest.writtenAt)} j
                        </Text>
                      </>
                    ) : (
                      <Text size="sm" c="dimmed">
                        aucun rapport
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {latest ? (
                      <Stack gap={2}>
                        <Badge
                          color={latest.totalErrors > 0 ? 'red' : 'green'}
                          variant="light"
                        >
                          {latest.totalErrors > 0
                            ? `${latest.totalErrors} erreur(s)`
                            : 'OK'}
                        </Badge>
                        <Text size="xs">
                          {latest.totalCreated} créés · {latest.totalUpdated}{' '}
                          mis à jour
                        </Text>
                        {latest.changedSources.length > 0 ? (
                          <Text size="xs" c="dimmed">
                            {latest.changedSources.join(', ')}
                          </Text>
                        ) : null}
                      </Stack>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Autres rapports (commandes hors DAG ou lancées à la main)
        </Title>
        {data.reports.filter((r) => !used.has(r.key)).length === 0 ? (
          <Text size="sm" c="dimmed">
            Aucun.
          </Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rapport</Table.Th>
                <Table.Th>Écrit le</Table.Th>
                <Table.Th>Résultat</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.reports
                .filter((r) => !used.has(r.key))
                .map((r) => (
                  <Table.Tr key={r.file}>
                    <Table.Td>{r.file}</Table.Td>
                    <Table.Td>{formatDate(r.writtenAt)}</Table.Td>
                    <Table.Td>
                      <Badge
                        color={r.totalErrors > 0 ? 'red' : 'green'}
                        variant="light"
                      >
                        {r.totalErrors > 0
                          ? `${r.totalErrors} erreur(s)`
                          : 'OK'}
                      </Badge>{' '}
                      <Text span size="xs">
                        {r.totalCreated} créés · {r.totalUpdated} mis à jour
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
