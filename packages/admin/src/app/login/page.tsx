'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Title,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Stack,
} from '@mantine/core';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError('Email ou mot de passe incorrect.');
    } else {
      router.push('/');
    }
  }

  return (
    <Container size="xs" py="xl">
      <Title order={2} mb="lg">
        Connexion
      </Title>
      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="votre@email.fr"
          />
          <PasswordInput
            label="Mot de passe"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          {error && <Alert color="red">{error}</Alert>}
          <Button type="submit" loading={loading}>
            Se connecter
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
