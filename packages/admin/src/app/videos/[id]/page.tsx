'use client';

/**
 * Détail d'un short : statut, scrutin lié (page Elupedia et sources
 * officielles), vignette et vidéo si rendues, script scène par scène, voix
 * off, texte d'accompagnement tel qu'il sera publié, notes et score.
 * Lecture seule : les décisions passent par `review approve|reject`.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Anchor,
  Badge,
  Button,
  Code,
  CopyButton,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { getVideo, type VideoDetail } from '../actions';
import { STATUS_COLORS, STATUS_LABELS, formatDate } from '../status';

const SCENE_KIND_LABELS: Record<string, string> = {
  hook: 'Accroche',
  context: 'Contexte',
  result: 'Résultat',
  groups: 'Groupes',
  division: 'Division',
  outro: 'Fin',
};

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoDetail | null | undefined>(undefined);

  useEffect(() => {
    getVideo(id).then(setVideo);
  }, [id]);

  if (video === undefined) return <Loader />;
  if (video === null) return <Text c="red">Vidéo introuvable : {id}</Text>;

  const script = video.script?.script ?? null;
  const fileUrl = (name: string) => `/api/videos/${video.id}/${name}`;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>{script?.title ?? 'Short sans script'}</Title>
          <Text size="xs" c="dimmed">
            {video.id}
          </Text>
        </Stack>
        <Group>
          <Badge color={STATUS_COLORS[video.status] ?? 'gray'} size="lg">
            {STATUS_LABELS[video.status] ?? video.status}
          </Badge>
          {video.youtubeVideoId ? (
            <Anchor
              href={`https://youtube.com/shorts/${video.youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Voir sur YouTube
            </Anchor>
          ) : null}
        </Group>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="lg">
            <Paper withBorder p="md">
              <Title order={4} mb="sm">
                Scrutin{video.ballots.length > 1 ? 's' : ''} lié
                {video.ballots.length > 1 ? 's' : ''}
              </Title>
              {video.ballots.length === 0 ? (
                <Text c="dimmed">Aucun scrutin rattaché.</Text>
              ) : (
                video.ballots.map((b) => (
                  <Stack key={b.id} gap={4} mb="sm">
                    <Text fw={500}>{b.title}</Text>
                    <Text size="sm" c="dimmed">
                      {b.chamber} · {b.date} · {b.type}
                      {b.result
                        ? ` · ${b.result === 'adopted' ? 'adopté' : 'rejeté'}`
                        : ''}
                    </Text>
                    <Anchor
                      href={b.elupediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Page du scrutin sur Elupedia
                    </Anchor>
                    {b.sources.map((s) => (
                      <Anchor
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                      >
                        {s.label}
                      </Anchor>
                    ))}
                  </Stack>
                ))
              )}
            </Paper>

            <Paper withBorder p="md">
              <Title order={4} mb="sm">
                Script
              </Title>
              {!script ? (
                <Text c="dimmed">Pas encore de script.</Text>
              ) : (
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">
                    Généré le {formatDate(video.script!.generatedAt)} · modèle{' '}
                    {video.script!.model} · {video.script!.attempts}{' '}
                    tentative(s)
                  </Text>
                  <Table withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Scène</Table.Th>
                        <Table.Th>Durée</Table.Th>
                        <Table.Th>Voix off</Table.Th>
                        <Table.Th>À l&apos;écran</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {script.scenes.map((s) => (
                        <Table.Tr key={s.id}>
                          <Table.Td>
                            <Text size="sm" fw={500}>
                              {s.id}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {SCENE_KIND_LABELS[s.kind] ?? s.kind} · {s.visual}
                            </Text>
                          </Table.Td>
                          <Table.Td>{s.durationSec} s</Table.Td>
                          <Table.Td>
                            <Text size="sm">{s.voiceover || <em>—</em>}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              {s.onScreenText || <em>—</em>}
                            </Text>
                            {s.lowerThird ? (
                              <Text size="xs" c="dimmed">
                                Bandeau : {s.lowerThird.name} —{' '}
                                {s.lowerThird.role}
                              </Text>
                            ) : null}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              )}
            </Paper>

            <Paper withBorder p="md">
              <Group justify="space-between" mb="sm">
                <Title order={4}>Texte d&apos;accompagnement</Title>
                {video.description ? (
                  <CopyButton value={video.description}>
                    {({ copied, copy }) => (
                      <Button size="xs" variant="light" onClick={copy}>
                        {copied ? 'Copié' : 'Copier'}
                      </Button>
                    )}
                  </CopyButton>
                ) : null}
              </Group>
              {video.description ? (
                <Code block style={{ whiteSpace: 'pre-wrap' }}>
                  {video.description}
                </Code>
              ) : (
                <Text c="dimmed">Disponible une fois le script généré.</Text>
              )}
            </Paper>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="lg">
            <Paper withBorder p="md">
              <Title order={4} mb="sm">
                Vidéo
              </Title>
              {video.files.video ? (
                <video
                  controls
                  preload="metadata"
                  poster={
                    video.files.thumbnail ? fileUrl('thumbnail.png') : undefined
                  }
                  style={{ width: '100%', maxWidth: 360, borderRadius: 8 }}
                  src={fileUrl('short.mp4')}
                />
              ) : (
                <Text c="dimmed">Pas encore rendue.</Text>
              )}
            </Paper>

            <Paper withBorder p="md">
              <Title order={4} mb="sm">
                Miniature
              </Title>
              {video.files.thumbnail ? (
                <img
                  src={fileUrl('thumbnail.png')}
                  alt="Miniature du short"
                  style={{ width: '100%', maxWidth: 240, borderRadius: 8 }}
                />
              ) : (
                <Text c="dimmed">Pas encore générée.</Text>
              )}
            </Paper>

            <Paper withBorder p="md">
              <Title order={4} mb="sm">
                Voix off
              </Title>
              {video.voiceover ? (
                <Stack gap={4}>
                  <Text size="sm">
                    {video.voiceover.provider === 'recorded'
                      ? 'Enregistrée'
                      : video.voiceover.provider}{' '}
                    · importée le {formatDate(video.voiceover.generatedAt)}
                  </Text>
                  {video.voiceover.scenes.map((s) => (
                    <Text key={s.sceneId} size="sm" c="dimmed">
                      {s.sceneId} : {s.durationSec} s, {s.words} mots
                    </Text>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed">Pas encore importée.</Text>
              )}
            </Paper>

            <Paper withBorder p="md">
              <Title order={4} mb="sm">
                Suivi
              </Title>
              <Stack gap={4}>
                <Text size="sm">Score de sélection : {video.score}</Text>
                <Text size="sm">Créé le {formatDate(video.createdAt)}</Text>
                <Text size="sm">
                  Mis à jour le {formatDate(video.updatedAt)}
                </Text>
                {video.publishedAt ? (
                  <Text size="sm">
                    Publié le {formatDate(video.publishedAt)}
                  </Text>
                ) : null}
                {video.notes ? (
                  <Code block style={{ whiteSpace: 'pre-wrap' }}>
                    {video.notes}
                  </Code>
                ) : null}
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
