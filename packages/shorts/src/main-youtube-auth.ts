import http from 'node:http';
import { logger } from './logger.js';
import { buildAuthUrl, exchangeCode } from './youtube.js';

/**
 * Autorisation YouTube, à faire une seule fois : ouvre une URL Google dans le
 * navigateur, reçoit le code sur un serveur local (redirection loopback,
 * recommandée par Google pour les applications installées) et affiche le
 * refresh_token à copier dans .env (YOUTUBE_REFRESH_TOKEN).
 *
 * Prérequis dans Google Cloud : projet avec l'API « YouTube Data API v3 »
 * activée, écran de consentement OAuth, identifiant client de type
 * « Application de bureau » → YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET.
 */

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  logger.error('YOUTUBE_CLIENT_ID et YOUTUBE_CLIENT_SECRET sont requises');
  process.exit(1);
}
const client = { clientId, clientSecret };

const server = http.createServer();
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    logger.error('Impossible de démarrer le serveur local');
    process.exit(1);
  }
  const redirectUri = `http://127.0.0.1:${address.port}`;
  console.log(
    '\nOuvrir cette URL dans un navigateur connecté au compte YouTube :\n',
  );
  console.log(buildAuthUrl(client, redirectUri));
  console.log('\nEn attente de la redirection…');

  server.on('request', async (req, res) => {
    const url = new URL(req.url ?? '/', redirectUri);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error ? `Refusé : ${error}` : 'Code manquant');
      if (error) {
        logger.error(`Autorisation refusée : ${error}`);
        server.close();
        process.exit(1);
      }
      return;
    }
    try {
      const { refreshToken } = await exchangeCode(client, code, redirectUri);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Autorisation reçue, vous pouvez fermer cet onglet.');
      console.log('\nAjouter à .env :\n');
      console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken}\n`);
      server.close();
      process.exit(0);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(e));
      logger.error(String(e));
      server.close();
      process.exit(1);
    }
  });
});
