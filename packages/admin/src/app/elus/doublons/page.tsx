'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Radio,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  listDuplicates,
  getDuplicateDetails,
  mergeOfficials,
  type DuplicateGroup,
} from './actions';

interface OfficialDetail {
  id: string;
  firstName: string;
  lastName: string;
  anId: string | null;
  senatId: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  deathDate: string | null;
  slug: string | null;
  updatedAt: Date;
  counts: Record<string, number>;
}

const TABLE_LABELS: Record<string, string> = {
  mandates: 'Mandats',
  votes: 'Votes',
  staffers: 'Collaborateurs',
  affiliations: 'Affiliations',
  interests: 'Intérêts',
  addresses: 'Adresses',
  external_links: 'Liens externes',
  press_mentions: 'Presse',
  parliamentary_activity: 'Activité parlementaire',
  committees: 'Commissions',
  electoral_results: 'Résultats électoraux',
  campaign_accounts: 'Comptes de campagne',
  declaration_snapshots: 'Déclarations',
};

function FieldRow({
  label,
  a,
  b,
}: {
  label: string;
  a: string | null;
  b: string | null;
}) {
  if (!a && !b) return null;
  const same = a === b;
  return (
    <Table.Tr>
      <Table.Td fw={500}>{label}</Table.Td>
      <Table.Td>{a ?? '—'}</Table.Td>
      <Table.Td>{b ?? '—'}</Table.Td>
      <Table.Td>
        {same ? (
          <Text size="sm" c="dimmed">
            identique
          </Text>
        ) : (
          <Badge color="orange" variant="light" size="sm">
            diff
          </Badge>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

export default function DoublonsPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { open, close }] = useDisclosure(false);
  const [details, setDetails] = useState<OfficialDetail[] | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  async function loadGroups() {
    setLoading(true);
    const data = await listDuplicates();
    setGroups(data);
    setLoading(false);
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function openDrawer(group: DuplicateGroup) {
    setDetails(null);
    setKeepId(null);
    open();
    const d = await getDuplicateDetails(group.ids);
    d.sort((a, b) => {
      const sa = a.slug ?? '￿';
      const sb = b.slug ?? '￿';
      return sa.localeCompare(sb, 'fr');
    });
    setDetails(d);
    if (d.length > 0) setKeepId(d[0].id);
  }

  async function handleMerge() {
    if (!details || !keepId) return;
    const removeId = details.find((d) => d.id !== keepId)?.id;
    if (!removeId) return;
    setMerging(true);
    await mergeOfficials(keepId, removeId);
    setMerging(false);
    close();
    await loadGroups();
  }

  return (
    <Stack>
      <Group align="center">
        <Title order={2}>Doublons d&apos;élus</Title>
        {!loading && groups.length > 0 && (
          <Badge size="lg" variant="filled" color="red">
            {groups.length}
          </Badge>
        )}
      </Group>
      <Text c="dimmed" size="sm">
        Élus ayant les mêmes nom, prénom et département dans au moins un mandat.
      </Text>

      {loading ? (
        <Loader />
      ) : groups.length === 0 ? (
        <Text c="dimmed">Aucun doublon détecté.</Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Département</Table.Th>
              <Table.Th>Fiches</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((g) => (
              <Table.Tr key={`${g.firstName}-${g.lastName}-${g.department}`}>
                <Table.Td>
                  {g.firstName} {g.lastName}
                </Table.Td>
                <Table.Td>{g.department}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{g.ids.length}</Badge>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => openDrawer(g)}
                  >
                    Résoudre
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Drawer
        opened={opened}
        onClose={close}
        title="Fusionner les doublons"
        position="right"
        size="xl"
      >
        {!details ? (
          <Loader />
        ) : (
          <Stack>
            <Text size="sm" fw={500}>
              Fiche à conserver :
            </Text>
            <Radio.Group value={keepId ?? ''} onChange={setKeepId}>
              <Stack gap="xs">
                {details.map((d) => (
                  <Radio
                    key={d.id}
                    value={d.id}
                    label={`${d.firstName} ${d.lastName} — slug: ${d.slug ?? '∅'} — AN: ${d.anId ?? '∅'} — Sénat: ${d.senatId ?? '∅'}`}
                  />
                ))}
              </Stack>
            </Radio.Group>

            <Title order={5} mt="md">
              Comparaison des champs
            </Title>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Champ</Table.Th>
                  <Table.Th>Fiche A</Table.Th>
                  <Table.Th>Fiche B</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <FieldRow
                  label="AN ID"
                  a={details[0]?.anId}
                  b={details[1]?.anId}
                />
                <FieldRow
                  label="Sénat ID"
                  a={details[0]?.senatId}
                  b={details[1]?.senatId}
                />
                <FieldRow
                  label="Date de naissance"
                  a={details[0]?.birthDate}
                  b={details[1]?.birthDate}
                />
                <FieldRow
                  label="Slug"
                  a={details[0]?.slug}
                  b={details[1]?.slug}
                />
                <FieldRow
                  label="Photo"
                  a={details[0]?.photoUrl}
                  b={details[1]?.photoUrl}
                />
              </Table.Tbody>
            </Table>

            <Title order={5} mt="md">
              Données rattachées
            </Title>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Table</Table.Th>
                  <Table.Th>Fiche A</Table.Th>
                  <Table.Th>Fiche B</Table.Th>
                  <Table.Th>Après fusion</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.keys(TABLE_LABELS).map((key) => {
                  const a = details[0]?.counts[key] ?? 0;
                  const b = details[1]?.counts[key] ?? 0;
                  if (a === 0 && b === 0) return null;
                  return (
                    <Table.Tr key={key}>
                      <Table.Td>{TABLE_LABELS[key]}</Table.Td>
                      <Table.Td>{a}</Table.Td>
                      <Table.Td>{b}</Table.Td>
                      <Table.Td fw={700}>{a + b}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Text size="sm" c="dimmed" mt="sm">
              La fiche conservée hérite des champs manquants (AN ID, Sénat ID,
              photo, etc.) de la fiche supprimée. Toutes les données rattachées
              sont transférées.
            </Text>

            <Group mt="lg">
              <Button
                color="red"
                loading={merging}
                onClick={handleMerge}
                disabled={!keepId}
              >
                Fusionner
              </Button>
              <Button variant="default" onClick={close}>
                Abandonner
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
