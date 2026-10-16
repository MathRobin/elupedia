'use client';

/**
 * Liste des shorts vidéo, filtrable par statut ; chaque ligne mène au détail
 * (/videos/[id]). Lecture seule.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  listVideos,
  type VideoListItem,
  type VideoStatusFilter,
} from './actions';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  VIDEO_STATUSES,
  formatDate,
} from './status';

export default function VideosPage() {
  const router = useRouter();
  const [status, setStatus] = useState<VideoStatusFilter>('all');
  const [videos, setVideos] = useState<VideoListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVideos(null);
    listVideos(status).then((rows) => {
      if (!cancelled) setVideos(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Vidéos (shorts)</Title>
        <SegmentedControl
          value={status}
          onChange={(v) => setStatus(v as VideoStatusFilter)}
          data={[
            { value: 'all', label: 'Tous' },
            ...VIDEO_STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABELS[s] ?? s,
            })),
          ]}
        />
      </Group>

      {videos === null ? (
        <Loader />
      ) : videos.length === 0 ? (
        <Text c="dimmed">Aucune vidéo pour ce statut.</Text>
      ) : (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Titre</Table.Th>
              <Table.Th>Statut</Table.Th>
              <Table.Th>Scrutin</Table.Th>
              <Table.Th>Score</Table.Th>
              <Table.Th>Étapes</Table.Th>
              <Table.Th>Créé le</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {videos.map((v) => (
              <Table.Tr
                key={v.id}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/videos/${v.id}`)}
              >
                <Table.Td>
                  <Text fw={500}>
                    {v.title ?? <em>Pas encore de script</em>}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {v.id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={STATUS_COLORS[v.status] ?? 'gray'}
                    variant="light"
                  >
                    {STATUS_LABELS[v.status] ?? v.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {v.ballotTitles.map((t, i) => (
                    <Text key={i} size="sm" lineClamp={2}>
                      {t}
                    </Text>
                  ))}
                </Table.Td>
                <Table.Td>{v.score}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Badge
                      size="xs"
                      variant={v.hasScript ? 'filled' : 'outline'}
                    >
                      script
                    </Badge>
                    <Badge
                      size="xs"
                      variant={v.hasVoiceover ? 'filled' : 'outline'}
                    >
                      voix
                    </Badge>
                    <Badge
                      size="xs"
                      variant={v.hasVideo ? 'filled' : 'outline'}
                    >
                      vidéo
                    </Badge>
                    {v.youtubeVideoId ? (
                      <Badge size="xs" color="teal">
                        YouTube
                      </Badge>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td>{formatDate(v.createdAt)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
