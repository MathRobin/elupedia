import { parseArgs } from 'node:util';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { publishShorts } from './publish.js';
import { DEFAULT_OUTPUT_DIR } from './voiceover.js';
import {
  createYoutubeUploader,
  refreshAccessToken,
  type PrivacyStatus,
} from './youtube.js';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    out: { type: 'string' },
    max: { type: 'string', default: '1' },
    privacy: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(
    [
      'Usage: yarn --cwd packages/shorts publish [options]',
      '',
      'Met en ligne sur YouTube les shorts approuvés (statut approved), les plus',
      'anciens d’abord. Nécessite YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et',
      'YOUTUBE_REFRESH_TOKEN (voir yarn --cwd packages/shorts youtube-auth).',
      '',
      'Options:',
      '  --id <uuid>          Un short précis (doit être approved)',
      '  --max <n>            Shorts publiés au maximum par exécution (défaut : 1)',
      '  --privacy <status>   public | unlisted | private (défaut : $YOUTUBE_PRIVACY_STATUS ou public)',
      `  --out <dir>          Dossier des vidéos (défaut : $SHORTS_OUTPUT_DIR ou ${DEFAULT_OUTPUT_DIR})`,
      '  --dry-run            Affiche ce qui serait publié, sans appel',
    ].join('\n'),
  );
  process.exit(0);
}

const privacy = (values.privacy ??
  process.env.YOUTUBE_PRIVACY_STATUS ??
  'public') as PrivacyStatus;
if (!['public', 'unlisted', 'private'].includes(privacy)) {
  logger.error(`--privacy invalide : ${privacy}`);
  process.exit(1);
}

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
if (!values['dry-run'] && (!clientId || !clientSecret || !refreshToken)) {
  logger.error(
    'YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et YOUTUBE_REFRESH_TOKEN sont requises',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const accessToken = values['dry-run']
    ? ''
    : await refreshAccessToken(
        { clientId: clientId!, clientSecret: clientSecret! },
        refreshToken!,
      );
  const { published, failed } = await publishShorts(
    createDb(),
    createYoutubeUploader(accessToken),
    {
      shortId: values.id,
      outputDir:
        values.out ?? process.env.SHORTS_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
      privacyStatus: privacy,
      max: Math.max(1, Number.parseInt(values.max, 10) || 1),
      dryRun: values['dry-run'],
    },
  );
  logger.info(
    `${published.length} publié(s), ${failed.length} échec(s)${values['dry-run'] ? ' (dry-run : rien publié)' : ''}`,
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  logger.error(`Publication échouée : ${error}`);
  process.exit(1);
});
