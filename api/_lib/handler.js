/* ================================================
   POINT D'ENTRÉE VERCEL — une instance d'API par instance de fonction
   (cache du jeton d'installation et limiteur en mémoire partagés entre
   invocations « chaudes »).
   ================================================ */

import { createApi } from './app.js';

let api = null;

/**
 * Handler Web standard (Request → Response) partagé par toutes les routes.
 * @param {Request} request
 */
export function handler(request) {
  api ??= createApi({ env: process.env });
  return api.handle(request);
}
