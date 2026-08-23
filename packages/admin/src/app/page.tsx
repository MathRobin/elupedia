import { Title, Text, Container } from '@mantine/core';

export default function Home() {
  return (
    <Container size="sm" py="xl">
      <Title order={1}>Elupedia Admin</Title>
      <Text mt="md" c="dimmed">
        Backoffice de modération — en construction.
      </Text>
    </Container>
  );
}
