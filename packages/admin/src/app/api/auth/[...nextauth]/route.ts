/**
 * Route API Auth.js (`/api/auth/*`) : expose les handlers GET/POST créés
 * dans lib/auth.ts (connexion par identifiants, session JWT, déconnexion).
 * Seul point d'entrée HTTP de l'authentification ; le chemin est laissé
 * public par proxy.ts. Aucune logique ici : tout est dans lib/auth.ts.
 */
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
