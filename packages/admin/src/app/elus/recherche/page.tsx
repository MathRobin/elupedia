'use client';

/** Recherche d'une fiche élu par nom ; clic vers la fiche admin. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { searchOfficialsDetailed, type OfficialSummary } from '../actions';

export default function RechercheElusPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<OfficialSummary[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    const t = setTimeout(() => searchOfficialsDetailed(q).then(setRows), 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Stack>
      <Title order={2}>Rechercher un élu</Title>
      <TextInput
        placeholder="Nom, prénom…"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        autoFocus
      />
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {query.trim().length < 2
            ? 'Saisir au moins deux caractères.'
            : 'Aucune fiche.'}
        </Text>
      ) : (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Naissance</Table.Th>
              <Table.Th>Mandats en cours</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/elus/${r.id}`)}
              >
                <Table.Td>
                  <Text fw={500}>
                    {r.firstName} {r.lastName}
                  </Text>
                  {r.deathDate ? (
                    <Text size="xs" c="dimmed">
                      décédé·e le {r.deathDate}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td>{r.birthDate ?? '—'}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {r.currentMandates.map((m) => (
                      <Badge
                        key={m}
                        size="sm"
                        variant="light"
                        style={{ textTransform: 'none' }}
                      >
                        {m}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
