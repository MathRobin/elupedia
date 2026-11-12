'use client';

/**
 * Tableau de bord des ingestions : DAGs planifiés et derniers rapports de run.
 * Chaque DAG a un bouton « Lancer » (admins, machine d'ingestion seulement)
 * qui met un run en file via triggerDagAction ; l'avancement se suit dans l'UI Dagu.
 */
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  loadIngestionsDashboard,
  triggerDagAction,
  type IngestionsDashboard,
} from './actions';
import { formatDate } from '../videos/status';

function TriggerButton({ file, name }: { file: string; name: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const launch = async () => {
    if (!window.confirm(`Lancer « ${name} » maintenant ?`)) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await triggerDagAction(file));
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Stack gap={4} align="flex-start">
      <Button size="xs" variant="light" loading={loading} onClick={launch}>
        Lancer
      </Button>
      {result ? (
        <Text size="xs" c={result.ok ? 'green' : 'red'}>
          {result.ok ? '✓ ' : '✗ '}
          {result.message}
        </Text>
      ) : null}
    </Stack>
  );
}

export default function IngestionsPage() {
  const [data, setData] = useState<IngestionsDashboard | null>(null);
  const { data: session } = useSession();
  const canTrigger =
    (session?.user as { role?: string } | undefined)?.role === 'admin' &&
    data?.reportsAvailable === true;
  useEffect(() => {
    loadIngestionsDashboard().then(setData);
  }, []);
  if (!data) return <Loader />;

  const reportByKey = new Map(data.reports.map((r) => [r.key, r]));
  const used = new Set<string>();
  const ageDays = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  // Un DAG peut produire plusieurs rapports (plusieurs commandes) : on retient
  // le plus récent. Les DAGs sont triés du dernier run au plus ancien, ceux
  // sans rapport en fin de liste, dans l'ordre des fichiers.
  const dagRows = data.dags
    .map((d) => {
      const reports = d.reportKeys
        .map((k) => reportByKey.get(k))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      reports.forEach((r) => used.add(r.key));
      const latest = [...reports].sort((a, b) =>
        b.writtenAt.localeCompare(a.writtenAt),
      )[0];
      return { dag: d, latest };
    })
    .sort((a, b) => {
      if (a.latest && b.latest)
        return b.latest.writtenAt.localeCompare(a.latest.writtenAt);
      if (a.latest) return -1;
      if (b.latest) return 1;
      return a.dag.file.localeCompare(b.dag.file);
    });
  const otherReports = data.reports
    .filter((r) => !used.has(r.key))
    .sort((a, b) => b.writtenAt.localeCompare(a.writtenAt));

  return (
    <Stack gap="lg">
      <Title order={2}>Ingestions</Title>
      <Text size="sm" c="dimmed">
        DAGs lus dans <Code>{data.dagsDir}</Code>, rapports de fin de run dans{' '}
        <Code>{data.reportsDir}</Code>. La date d&apos;un rapport est celle de
        la fin du dernier run de la commande, planifié ou lancé à la main. Les
        DAGs sont triés du dernier run au plus ancien, ceux sans rapport à la
        fin. Le bouton « Lancer » (admins) met un run en file dans Dagu (
        <Code>scripts/trigger-dag.sh</Code>). L&apos;état en direct de Dagu
        n&apos;est pas remonté (API locale authentifiée).
      </Text>
      {data.reportsAvailable ? null : (
        <Alert color="yellow">
          Admin hébergée : les rapports de run sont écrits sur la machine
          d&apos;ingestion et ne sont pas visibles ici. Seuls les DAGs du dépôt
          sont listés.
        </Alert>
      )}

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
              {canTrigger ? <Table.Th>Action</Table.Th> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dagRows.map(({ dag: d, latest }) => {
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
                  {canTrigger ? (
                    <Table.Td>
                      <TriggerButton file={d.file} name={d.name} />
                    </Table.Td>
                  ) : null}
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
        {otherReports.length === 0 ? (
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
              {otherReports.map((r) => (
                <Table.Tr key={r.file}>
                  <Table.Td>{r.file}</Table.Td>
                  <Table.Td>{formatDate(r.writtenAt)}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={r.totalErrors > 0 ? 'red' : 'green'}
                      variant="light"
                    >
                      {r.totalErrors > 0 ? `${r.totalErrors} erreur(s)` : 'OK'}
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
