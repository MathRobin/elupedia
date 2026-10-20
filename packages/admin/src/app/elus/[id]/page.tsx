'use client';

/** Fiche élu dans l'admin : identité, mandats, corrections manuelles tracées. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Anchor,
  Button,
  Code,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  addOfficialAlias,
  endMandate,
  getOfficial,
  removeOfficialAlias,
  reopenMandate,
  updateOfficialField,
  type OfficialDetail,
} from '../actions';
import { formatDate } from '../../videos/status';

function FieldEditor({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(value ?? ''), [value]);
  return (
    <Group align="flex-end" gap="xs">
      <TextInput
        label={label}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        style={{ flex: 1 }}
        error={error}
      />
      <Button
        size="xs"
        variant="light"
        loading={busy}
        disabled={draft === (value ?? '')}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave(draft);
          } catch (e) {
            setError(String(e instanceof Error ? e.message : e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Enregistrer
      </Button>
    </Group>
  );
}

export default function OfficialPage() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<OfficialDetail | null | undefined>(undefined);
  const [endDrafts, setEndDrafts] = useState<Record<string, string>>({});
  const [alias, setAlias] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    note: '',
  });
  const [aliasError, setAliasError] = useState<string | null>(null);
  const reload = useCallback(() => getOfficial(id).then(setO), [id]);
  useEffect(() => {
    reload();
  }, [reload]);

  if (o === undefined) return <Loader />;
  if (o === null) return <Text c="red">Fiche introuvable : {id}</Text>;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={2}>
            {o.firstName} {o.lastName}
          </Title>
          <Text size="xs" c="dimmed">
            {o.id} · AN {o.anId ?? '—'} · Sénat {o.senatId ?? '—'} · PE{' '}
            {o.europarlId ?? '—'}
          </Text>
          {o.slug ? (
            <Anchor
              href={`https://www.elupedia.fr/elus/${o.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              Fiche publique sur Elupedia
            </Anchor>
          ) : null}
        </Stack>
        {o.s3PhotoUrl || o.photoUrl ? (
          <img
            src={o.s3PhotoUrl ?? o.photoUrl ?? ''}
            alt=""
            style={{
              width: 96,
              height: 96,
              objectFit: 'cover',
              borderRadius: 8,
            }}
          />
        ) : null}
      </Group>

      <Alert color="yellow" variant="light" title="Corrections manuelles">
        Chaque modification est tracée dans <Code>data_provenance</Code> (source
        « Admin Elupedia »). L&apos;ingestion reste la source de vérité : une
        passe AN ou Sénat peut remettre une date de naissance ou une photo
        depuis sa source, et rouvrir un mandat clos ici si elle le publie encore
        comme en cours. La trace permet au moins de le constater.
      </Alert>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Identité
        </Title>
        <Stack>
          <FieldEditor
            label="Date de naissance (AAAA-MM-JJ)"
            value={o.birthDate}
            onSave={async (v) => {
              await updateOfficialField(o.id, 'birthDate', v);
              await reload();
            }}
          />
          <FieldEditor
            label="Date de décès (AAAA-MM-JJ, vide si en vie)"
            value={o.deathDate}
            onSave={async (v) => {
              await updateOfficialField(o.id, 'deathDate', v);
              await reload();
            }}
          />
          <FieldEditor
            label="URL de la photo source"
            value={o.photoUrl}
            onSave={async (v) => {
              await updateOfficialField(o.id, 'photoUrl', v);
              await reload();
            }}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Mandats
        </Title>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Circonscription</Table.Th>
              <Table.Th>Groupe</Table.Th>
              <Table.Th>Début</Table.Th>
              <Table.Th>Fin</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {o.mandates.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.type}</Table.Td>
                <Table.Td>
                  {[m.district, m.department].filter(Boolean).join(' · ') ||
                    '—'}
                </Table.Td>
                <Table.Td>{m.politicalGroup ?? '—'}</Table.Td>
                <Table.Td>{m.startDate}</Table.Td>
                <Table.Td>
                  {m.endDate ?? (
                    <Text span c="green">
                      en cours
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {m.endDate === null ? (
                    <Group gap="xs" wrap="nowrap">
                      <TextInput
                        size="xs"
                        placeholder="AAAA-MM-JJ"
                        value={endDrafts[m.id] ?? ''}
                        onChange={(e) =>
                          setEndDrafts({
                            ...endDrafts,
                            [m.id]: e.currentTarget.value,
                          })
                        }
                        w={120}
                      />
                      <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        disabled={
                          !/^\d{4}-\d{2}-\d{2}$/.test(endDrafts[m.id] ?? '')
                        }
                        onClick={async () => {
                          await endMandate(m.id, endDrafts[m.id]);
                          await reload();
                        }}
                      >
                        Clore
                      </Button>
                    </Group>
                  ) : (
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={async () => {
                        await reopenMandate(m.id);
                        await reload();
                      }}
                    >
                      Rouvrir
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Alias de rapprochement
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Écritures alternatives (prénom, nom, date de naissance) sous
          lesquelles les ingestions RNE doivent reconnaître cette fiche : année
          de naissance erronée dans un fichier source, prénom composé tronqué…
          Les fusions de doublons en ajoutent automatiquement.
        </Text>
        {o.aliases.length > 0 ? (
          <Table mb="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Prénom</Table.Th>
                <Table.Th>Nom</Table.Th>
                <Table.Th>Naissance</Table.Th>
                <Table.Th>Origine</Table.Th>
                <Table.Th>Note</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {o.aliases.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>{a.firstName}</Table.Td>
                  <Table.Td>{a.lastName}</Table.Td>
                  <Table.Td>{a.birthDate ?? '—'}</Table.Td>
                  <Table.Td>{a.source}</Table.Td>
                  <Table.Td>{a.note ?? ''}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={async () => {
                        await removeOfficialAlias(a.id);
                        await reload();
                      }}
                    >
                      Retirer
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed" mb="sm">
            Aucun alias.
          </Text>
        )}
        <Group align="flex-end" gap="xs">
          <TextInput
            label="Prénom"
            size="xs"
            value={alias.firstName}
            onChange={(e) =>
              setAlias({ ...alias, firstName: e.currentTarget.value })
            }
          />
          <TextInput
            label="Nom"
            size="xs"
            value={alias.lastName}
            onChange={(e) =>
              setAlias({ ...alias, lastName: e.currentTarget.value })
            }
          />
          <TextInput
            label="Naissance (AAAA-MM-JJ)"
            size="xs"
            w={160}
            value={alias.birthDate}
            onChange={(e) =>
              setAlias({ ...alias, birthDate: e.currentTarget.value })
            }
          />
          <TextInput
            label="Note"
            size="xs"
            value={alias.note}
            onChange={(e) =>
              setAlias({ ...alias, note: e.currentTarget.value })
            }
            style={{ flex: 1 }}
          />
          <Button
            size="xs"
            variant="light"
            disabled={!alias.firstName.trim() || !alias.lastName.trim()}
            onClick={async () => {
              setAliasError(null);
              try {
                await addOfficialAlias(
                  o.id,
                  alias.firstName,
                  alias.lastName,
                  alias.birthDate,
                  alias.note,
                );
                setAlias({
                  firstName: '',
                  lastName: '',
                  birthDate: '',
                  note: '',
                });
                await reload();
              } catch (e) {
                setAliasError(String(e instanceof Error ? e.message : e));
              }
            }}
          >
            Ajouter
          </Button>
        </Group>
        {aliasError ? (
          <Text size="xs" c="red" mt="xs">
            {aliasError}
          </Text>
        ) : null}
      </Paper>

      {o.corrections.length > 0 ? (
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Corrections manuelles
          </Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quand</Table.Th>
                <Table.Th>Qui</Table.Th>
                <Table.Th>Champ</Table.Th>
                <Table.Th>Avant</Table.Th>
                <Table.Th>Après</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {o.corrections.map((c, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{formatDate(c.at)}</Table.Td>
                  <Table.Td>{c.by}</Table.Td>
                  <Table.Td>{c.field}</Table.Td>
                  <Table.Td>{String(c.before ?? '—')}</Table.Td>
                  <Table.Td>{String(c.after ?? '—')}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      ) : null}
    </Stack>
  );
}
