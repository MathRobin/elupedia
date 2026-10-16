'use client';

/** Dérive des faits entre les scripts des shorts et la base. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Code, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { listDrift, type DriftRow } from './actions';
import { STATUS_COLORS, STATUS_LABELS, formatDate } from '../status';

export default function DerivePage() {
  const [rows, setRows] = useState<DriftRow[] | null>(null);
  useEffect(() => {
    listDrift().then(setRows);
  }, []);
  if (!rows) return <Loader />;
  return (
    <Stack>
      <Title order={2}>Dérive des faits</Title>
      <Text size="sm" c="dimmed">
        Shorts non publiés dont les chiffres énoncés par la voix ne
        correspondent plus à la base (mises au point de l&apos;Assemblée après
        coup). Un short en dérive ne peut pas être publié : regénérer le script,
        réenregistrer, rendre.
      </Text>
      {rows.length === 0 ? (
        <Text c="dimmed">Aucun short avec script.</Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Short</Table.Th>
              <Table.Th>Statut</Table.Th>
              <Table.Th>Script du</Table.Th>
              <Table.Th>Dérive</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Link href={`/videos/${r.id}`}>{r.title ?? r.id}</Link>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={STATUS_COLORS[r.status] ?? 'gray'}
                    variant="light"
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatDate(r.scriptAt)}</Table.Td>
                <Table.Td>
                  {r.drift.length === 0 ? (
                    <Badge color="green" variant="light">
                      à jour
                    </Badge>
                  ) : (
                    <Stack gap={2}>
                      {r.drift.map((d, i) => (
                        <Code key={i}>
                          {d.field} : script {String(d.frozen)} → base{' '}
                          {String(d.current)}
                        </Code>
                      ))}
                    </Stack>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
