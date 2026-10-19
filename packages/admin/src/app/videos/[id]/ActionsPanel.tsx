'use client';

/**
 * Panneau d'actions d'un short : revue (approuver / rejeter), publication
 * YouTube (avec aperçu des bloqueurs et de la dérive des faits), et
 * lancement des commandes longues en tâche de fond avec journal en direct.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  approveShort,
  markPublished,
  getShortJob,
  launchShortJob,
  publishPreview,
  publishShort,
  rejectShort,
  rescriptCostEstimate,
  type JobView,
  type PublishPreview,
} from './actions';
import type { ShortJobKind } from '@/lib/shorts-jobs';

interface Props {
  id: string;
  status: string;
  hasScript: boolean;
  hasVoiceover: boolean;
  hasVideo: boolean;
  onChanged: () => void;
}

const JOB_BUTTONS: {
  kind: ShortJobKind;
  label: string;
  when: (p: Props) => boolean;
}[] = [
  {
    kind: 'make',
    label: 'Tout enchaîner (make)',
    when: (p) => p.status !== 'published',
  },
  {
    kind: 'sheet',
    label: 'Fiche de lecture',
    when: (p) => p.hasScript && !p.hasVoiceover,
  },
  { kind: 'import', label: 'Importer les prises', when: (p) => p.hasScript },
  { kind: 'render', label: 'Rendre la vidéo', when: (p) => p.hasScript },
  {
    kind: 'render-draft',
    label: 'Rendu rapide de contrôle',
    when: (p) => p.hasScript,
  },
  {
    kind: 'make-silent',
    label: 'Rendre sans voix',
    when: (p) => p.hasScript && !p.hasVoiceover,
  },
];

export function ActionsPanel(props: Props) {
  const { id, status, hasScript, hasVideo, onChanged } = props;
  const [job, setJob] = useState<JobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [rejectOpened, rejectHandlers] = useDisclosure(false);
  const [note, setNote] = useState('');
  const [publishOpened, publishHandlers] = useDisclosure(false);
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [privacy, setPrivacy] = useState<string>('public');
  const [manualOpened, manualHandlers] = useDisclosure(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [rescriptOpened, rescriptHandlers] = useDisclosure(false);
  const [estimate, setEstimate] = useState<string | null>(null);

  const refreshJob = useCallback(async () => {
    const j = await getShortJob(id);
    setJob(j);
    return j;
  }, [id]);

  useEffect(() => {
    refreshJob();
  }, [refreshJob]);

  // Suivi d'une tâche en cours : journal rafraîchi toutes les 2 s, puis
  // rechargement de la page de détail à la fin.
  useEffect(() => {
    if (job?.state?.status !== 'running') return;
    const timer = setInterval(async () => {
      const j = await refreshJob();
      if (j.state?.status !== 'running') {
        clearInterval(timer);
        onChanged();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.state?.status, refreshJob, onChanged]);

  async function run(fn: () => Promise<unknown>, okText?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (okText) setMessage({ ok: true, text: okText });
      onChanged();
    } catch (e) {
      setMessage({
        ok: false,
        text: String(e instanceof Error ? e.message : e),
      });
    } finally {
      setBusy(false);
    }
  }

  const running = job?.state?.status === 'running';

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        Actions
      </Title>
      {message ? (
        <Alert
          color={message.ok ? 'green' : 'red'}
          mb="sm"
          withCloseButton
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      ) : null}

      <Stack gap="sm">
        <Group gap="xs">
          <Text size="sm" fw={500} w={90}>
            Revue
          </Text>
          <Button
            size="xs"
            color="green"
            disabled={busy || running || !hasVideo || status === 'published'}
            onClick={() =>
              run(
                () => approveShort(id),
                'Short approuvé : il sera publié par le prochain passage de publication',
              )
            }
          >
            Approuver
          </Button>
          <Button
            size="xs"
            color="orange"
            variant="outline"
            disabled={busy || running || status === 'published'}
            onClick={rejectHandlers.open}
          >
            Rejeter
          </Button>
          {!hasVideo && status !== 'published' ? (
            <Text size="xs" c="dimmed">
              Approuver exige une vidéo rendue.
            </Text>
          ) : null}
        </Group>

        <Group gap="xs">
          <Text size="sm" fw={500} w={90}>
            Publication
          </Text>
          <Button
            size="xs"
            color="teal"
            disabled={busy || running || status !== 'approved'}
            onClick={async () => {
              setBusy(true);
              try {
                const p = await publishPreview(id);
                setPreview(p);
                setPrivacy(p.privacy);
                publishHandlers.open();
              } finally {
                setBusy(false);
              }
            }}
          >
            Publier sur YouTube…
          </Button>
          <Button
            size="xs"
            color="teal"
            variant="outline"
            disabled={busy || running || status === 'published'}
            onClick={manualHandlers.open}
          >
            Marquer publié…
          </Button>
          {status !== 'approved' && status !== 'published' ? (
            <Text size="xs" c="dimmed">
              Seul un short approuvé se publie par le pipeline ; « Marquer
              publié » enregistre une mise en ligne faite à la main.
            </Text>
          ) : null}
        </Group>

        <Group gap="xs" align="flex-start">
          <Text size="sm" fw={500} w={90} pt={4}>
            Pipeline
          </Text>
          <Group gap="xs">
            {JOB_BUTTONS.filter((b) => b.when(props)).map((b) => (
              <Button
                key={b.kind}
                size="xs"
                variant="light"
                disabled={busy || running}
                onClick={() =>
                  run(() => launchShortJob(id, b.kind).then(setJob))
                }
              >
                {b.label}
              </Button>
            ))}
            <Button
              size="xs"
              variant="light"
              color="grape"
              disabled={busy || running}
              onClick={async () => {
                setEstimate(await rescriptCostEstimate(id));
                rescriptHandlers.open();
              }}
            >
              {hasScript ? 'Regénérer le script…' : 'Générer le script…'}
            </Button>
          </Group>
        </Group>

        {job?.state ? (
          <Stack gap={4}>
            <Group gap="xs">
              <Badge
                color={
                  job.state.status === 'running'
                    ? 'blue'
                    : job.state.status === 'done'
                      ? 'green'
                      : 'red'
                }
              >
                {job.state.status === 'running'
                  ? 'en cours'
                  : job.state.status === 'done'
                    ? 'terminée'
                    : 'échouée'}
              </Badge>
              <Text size="sm">{job.label}</Text>
              <Text size="xs" c="dimmed">
                démarrée le{' '}
                {new Date(job.state.startedAt).toLocaleString('fr-FR')}
              </Text>
            </Group>
            <Code
              block
              style={{
                whiteSpace: 'pre-wrap',
                maxHeight: 260,
                overflow: 'auto',
              }}
            >
              {job.log || '(journal vide pour l’instant)'}
            </Code>
          </Stack>
        ) : null}
      </Stack>

      <Modal
        opened={rejectOpened}
        onClose={rejectHandlers.close}
        title="Rejeter ce short"
      >
        <Stack>
          <Textarea
            label="Motif (conservé dans les notes)"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Button
            color="orange"
            disabled={!note.trim()}
            onClick={() =>
              run(async () => {
                await rejectShort(id, note);
                rejectHandlers.close();
                setNote('');
              }, 'Short rejeté')
            }
          >
            Confirmer le rejet
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={manualOpened}
        onClose={manualHandlers.close}
        title="Marquer ce short comme publié"
      >
        <Stack>
          <Text size="sm">
            Pour une mise en ligne faite à la main, hors pipeline. Le short
            passe en « publié » avec la date du jour ; il ne sera plus repris
            par la publication automatique.
          </Text>
          <TextInput
            label="Lien ou identifiant de la vidéo YouTube (facultatif)"
            placeholder="https://youtube.com/shorts/…"
            value={youtubeInput}
            onChange={(e) => setYoutubeInput(e.currentTarget.value)}
          />
          <Textarea
            label="Note (facultatif, conservée dans les notes)"
            value={manualNote}
            onChange={(e) => setManualNote(e.currentTarget.value)}
            autosize
            minRows={1}
          />
          <Button
            color="teal"
            onClick={() =>
              run(async () => {
                await markPublished(id, youtubeInput, manualNote);
                manualHandlers.close();
                setYoutubeInput('');
                setManualNote('');
              }, 'Short marqué publié')
            }
          >
            Confirmer
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={publishOpened}
        onClose={publishHandlers.close}
        title="Publier sur YouTube"
      >
        {preview ? (
          <Stack>
            <Text size="sm">
              Titre : <strong>{preview.title}</strong>
            </Text>
            {preview.drift ? (
              <Alert color="red" title="Les faits ont changé depuis le script">
                {preview.drift}. Regénérer le script, réenregistrer, puis rendre
                à nouveau.
              </Alert>
            ) : null}
            {preview.blockers.length > 0 ? (
              <Alert color="orange" title="Publication bloquée">
                <Stack gap={2}>
                  {preview.blockers.map((b) => (
                    <Text key={b} size="sm">
                      • {b}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : (
              <Alert color="green">
                Aucun bloqueur : les chiffres de la vidéo correspondent à la
                base.
              </Alert>
            )}
            <Select
              label="Visibilité"
              data={[
                { value: 'public', label: 'Publique' },
                { value: 'unlisted', label: 'Non répertoriée' },
                { value: 'private', label: 'Privée' },
              ]}
              value={privacy}
              onChange={(v) => setPrivacy(v ?? 'public')}
            />
            <Button
              color="teal"
              disabled={busy || preview.blockers.length > 0}
              onClick={() =>
                run(async () => {
                  const r = await publishShort(
                    id,
                    privacy as 'public' | 'unlisted' | 'private',
                  );
                  if (!r.ok) throw new Error(r.message);
                  publishHandlers.close();
                }, 'Publié sur YouTube')
              }
            >
              Publier maintenant
            </Button>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={rescriptOpened}
        onClose={rescriptHandlers.close}
        title={hasScript ? 'Regénérer le script' : 'Générer le script'}
      >
        <Stack>
          <Text size="sm">
            Appel payant à l&apos;API Claude{estimate ? ` : ${estimate}` : ''}.
            {hasScript
              ? ' Le script actuel est remplacé ; la voix enregistrée ne correspondra plus aux textes : il faudra réenregistrer, réimporter et rendre à nouveau.'
              : ''}
          </Text>
          <Button
            color="grape"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setJob(await launchShortJob(id, 'rescript'));
                rescriptHandlers.close();
              })
            }
          >
            Lancer
          </Button>
        </Stack>
      </Modal>
    </Paper>
  );
}
