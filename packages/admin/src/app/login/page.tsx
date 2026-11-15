'use client';

/**
 * Page /login (rendu client) : formulaire email + mot de passe envoyé au
 * fournisseur `credentials` d'Auth.js via signIn (lib/auth.ts), sans
 * redirection automatique pour afficher l'erreur sur place ; succès → push
 * vers /. L'erreur distingue l'identifiant refusé (`CredentialsSignin`) d'une
 * panne serveur, qui porterait autrement le même message. Seule page publique avec /api/auth (voir proxy.ts). Aucun rôle
 * requis ; un utilisateur déjà connecté peut la rouvrir.
 */
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
      // Auth.js rend `CredentialsSignin` quand authorize renvoie null, et un
      // autre code (Configuration, CallbackRouteError…) quand il échoue :
      // afficher le même message pour les deux masquerait une panne serveur
      // (base injoignable, AUTH_SECRET absent) derrière « mot de passe
      // incorrect ».
      setError(
        result.error === 'CredentialsSignin'
          ? 'Email ou mot de passe incorrect.'
          : `Connexion impossible (${result.error}) : voir les journaux du serveur.`,
      );
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
