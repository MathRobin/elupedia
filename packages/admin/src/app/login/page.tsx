'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import {
  Container,
  Title,
  TextInput,
  Button,
  Alert,
  Stack,
} from '@mantine/core';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const result = await signIn('nodemailer', {
      email,
      redirect: false,
    });
    if (result?.error) {
      setError('Connexion refusée. Vérifiez que votre email est autorisé.');
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Container size="xs" py="xl">
        <Alert color="green" title="Lien envoyé">
          Un lien de connexion a été envoyé à {email}. Vérifiez votre boîte
          mail.
        </Alert>
      </Container>
    );
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
          {error && <Alert color="red">{error}</Alert>}
          <Button type="submit">Recevoir un lien de connexion</Button>
        </Stack>
      </form>
    </Container>
  );
}
