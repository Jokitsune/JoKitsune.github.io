// Route Vercel GET /api/auth/callback — logique dans api/_lib (testée sans serveur).
// Toutes les méthodes sont exportées : les non prévues reçoivent un 405 normalisé, sans CORS.
import { handler } from '../_lib/handler.js';

export { handler as GET, handler as HEAD, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
