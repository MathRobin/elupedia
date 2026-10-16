'use client';

/** Rattachement manuel des parrainages et candidats sans fiche élu. */
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  attachToOfficial,
  listUnresolved,
  searchOfficials,
  unresolvedSummary,
  type OfficialHit,
  type UnresolvedRow,
  type UnresolvedSummary,
} from './actions';

export default function RattachementsPage() {
  const [summary, setSummary] = useState<UnresolvedSummary | null>(null);
  const [kind, setKind] = useState<UnresolvedRow['kind']>('sponsorship');
  const [year, setYear] = useState<string>('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<UnresolvedRow[] | null>(null);
  const [target, setTarget] = useState<UnresolvedRow | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<OfficialHit[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadSummary() {
    const s = await unresolvedSummary();
    setSummary(s);
    if (!year) {
      const first =
        kind === 'sponsorship'
          ? s.sponsorships[0]?.electionYear
          : s.senatorialCandidates[0]?.electionYear;
      if (first !== undefined) setYear(String(first));
    }
  }
  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (!year) return;
    setRows(null);
    listUnresolved(kind, year, query).then(setRows);
  }, [kind, year, query]);

  async function doSearch(q: string) {
    setSearch(q);
    setHits(q.trim().length >= 2 ? await searchOfficials(q) : []);
  }

  async function attach(officialId: string) {
    if (!target) return;
    setBusy(true);
    try {
      await attachToOfficial(target.kind, target.id, officialId);
      setTarget(null);
      setRows((r) => (r ? r.filter((x) => x.id !== target.id) : r));
      loadSummary();
    } finally {
      setBusy(false);
    }
  }

  const years =
    kind === 'sponsorship'
      ? (summary?.sponsorships ?? []).map((s) => ({
          value: String(s.electionYear),
          label: `${s.electionYear} (${s.count})`,
        }))
      : (summary?.senatorialCandidates ?? []).map((s) => ({
          value: s.electionYear,
          label: `${s.electionYear} (${s.count})`,
        }));
  const uniqueYears = years.filter(
    (y, i, a) => a.findIndex((z) => z.value === y.value) === i,
  );

  return (
    <Stack gap="lg">
      <Title order={2}>Rattachements à une fiche élu</Title>
      <Text size="sm" c="dimmed">
        Enregistrements que l&apos;ingestion n&apos;a pas su relier à une fiche
        (nom non retrouvé). Chercher la bonne fiche, vérifier ses mandats,
        confirmer. Irréversible depuis cette page.
      </Text>
      <Group>
        <SegmentedControl
          value={kind}
          onChange={(v) => {
            setKind(v as UnresolvedRow['kind']);
            setYear('');
            setTimeout(loadSummary, 0);
          }}
          data={[
            { value: 'sponsorship', label: 'Parrainages et RIP' },
            { value: 'senatorial_candidate', label: 'Candidats sénatoriales' },
          ]}
        />
        {uniqueYears.length > 0 ? (
          <SegmentedControl
            value={year}
            onChange={setYear}
            data={uniqueYears}
          />
        ) : null}
        <TextInput
          placeholder="Filtrer par nom"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      </Group>

      <Paper withBorder p="md">
        {rows === null ? (
          <Loader />
        ) : rows.length === 0 ? (
          <Text c="dimmed">Rien à rattacher pour cette sélection.</Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nom (source)</Table.Th>
                <Table.Th>Détail</Table.Th>
                <Table.Th>Contexte</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Text fw={500}>{r.name}</Text>
                  </Table.Td>
                  <Table.Td>{r.detail}</Table.Td>
                  <Table.Td>{r.context}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      onClick={() => {
                        setTarget(r);
                        doSearch(r.name.replace(/^(M\.|Mme|MM\.)\s+/i, ''));
                      }}
                    >
                      Rattacher…
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {rows && rows.length === 50 ? (
          <Text size="xs" c="dimmed" mt="xs">
            50 premiers résultats : affiner par nom.
          </Text>
        ) : null}
      </Paper>

      <Modal
        opened={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `Rattacher « ${target.name} »` : ''}
        size="lg"
      >
        <Stack>
          <TextInput
            label="Chercher une fiche"
            value={search}
            onChange={(e) => doSearch(e.currentTarget.value)}
          />
          {hits.length === 0 ? (
            <Text size="sm" c="dimmed">
              Aucune fiche pour cette recherche.
            </Text>
          ) : (
            hits.map((h) => (
              <Group
                key={h.id}
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
              >
                <Stack gap={0}>
                  <Text fw={500}>
                    {h.firstName} {h.lastName}{' '}
                    {h.birthDate ? (
                      <Text span size="xs" c="dimmed">
                        né·e le {h.birthDate}
                      </Text>
                    ) : null}
                  </Text>
                  {h.mandates.map((m) => (
                    <Badge
                      key={m}
                      size="xs"
                      variant="light"
                      style={{ textTransform: 'none' }}
                    >
                      {m}
                    </Badge>
                  ))}
                </Stack>
                <Button size="xs" loading={busy} onClick={() => attach(h.id)}>
                  C&apos;est cette personne
                </Button>
              </Group>
            ))
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
