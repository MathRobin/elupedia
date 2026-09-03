'use client';

import { useEffect, useState } from 'react';
import { Table, Button, Group, Title, Stack, Badge, Text } from '@mantine/core';
import { listPendingLinks, moderateLink } from './actions';

interface PendingLink {
  id: string;
  officialId: string;
  platform: string;
  url: string;
  source: string;
  capturedAt: string | null;
  officialFirstName: string;
  officialLastName: string;
}

const platformLabels: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
};

export default function ModerationPage() {
  const [links, setLinks] = useState<PendingLink[]>([]);

  async function loadLinks() {
    const data = await listPendingLinks();
    setLinks(data as PendingLink[]);
  }

  useEffect(() => {
    loadLinks();
  }, []);

  async function handleAction(
    linkId: string,
    action: 'published' | 'rejected' | 'deleted',
  ) {
    await moderateLink(linkId, action);
    await loadLinks();
  }

  return (
    <Stack>
      <Title order={2}>Queue de modération</Title>

      {links.length === 0 ? (
        <Text c="dimmed">Aucun lien en attente de modération.</Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Élu</Table.Th>
              <Table.Th>Plateforme</Table.Th>
              <Table.Th>URL</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Détecté le</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {links.map((link) => (
              <Table.Tr key={link.id}>
                <Table.Td>
                  <a
                    href={`https://www.elupedia.fr/elus/${link.officialFirstName.toLowerCase()}-${link.officialLastName.toLowerCase()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.officialFirstName} {link.officialLastName}
                  </a>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">
                    {platformLabels[link.platform] ?? link.platform}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.url.length > 50
                      ? `${link.url.slice(0, 50)}…`
                      : link.url}
                  </a>
                </Table.Td>
                <Table.Td>{link.source}</Table.Td>
                <Table.Td>{link.capturedAt ?? '—'}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      color="green"
                      onClick={() => handleAction(link.id, 'published')}
                    >
                      Approuver
                    </Button>
                    <Button
                      size="xs"
                      color="orange"
                      variant="outline"
                      onClick={() => handleAction(link.id, 'rejected')}
                    >
                      Rejeter
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="outline"
                      onClick={() => handleAction(link.id, 'deleted')}
                    >
                      Supprimer
                    </Button>
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
