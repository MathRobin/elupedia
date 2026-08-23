'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Select,
  TextInput,
  Group,
  Title,
  Stack,
  ActionIcon,
} from '@mantine/core';
import { RequireRole } from '@/components/RequireRole';
import { listUsers, updateUserRole, deleteUser, inviteUser } from './actions';

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

function UsersContent() {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<string>('moderator');

  async function loadUsers() {
    const data = await listUsers();
    setUsersList(data as User[]);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleRoleChange(userId: string, role: string) {
    await updateUserRole(userId, role);
    await loadUsers();
  }

  async function handleDelete(userId: string) {
    await deleteUser(userId);
    await loadUsers();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;
    await inviteUser(newEmail, newRole);
    setNewEmail('');
    await loadUsers();
  }

  return (
    <Stack>
      <Title order={2}>Gestion des utilisateurs</Title>

      <form onSubmit={handleInvite}>
        <Group>
          <TextInput
            placeholder="email@exemple.fr"
            value={newEmail}
            onChange={(e) => setNewEmail(e.currentTarget.value)}
            type="email"
            required
          />
          <Select
            data={[
              { value: 'moderator', label: 'Modérateur' },
              { value: 'admin', label: 'Admin' },
            ]}
            value={newRole}
            onChange={(v) => setNewRole(v ?? 'moderator')}
          />
          <Button type="submit">Inviter</Button>
        </Group>
      </form>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Email</Table.Th>
            <Table.Th>Rôle</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {usersList.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.email}</Table.Td>
              <Table.Td>
                <Select
                  data={[
                    { value: 'moderator', label: 'Modérateur' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                  value={u.role}
                  onChange={(v) => v && handleRoleChange(u.id, v)}
                  size="xs"
                />
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => handleDelete(u.id)}
                  aria-label={`Supprimer ${u.email}`}
                >
                  ✕
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export default function UsersPage() {
  return (
    <RequireRole role="admin">
      <UsersContent />
    </RequireRole>
  );
}
