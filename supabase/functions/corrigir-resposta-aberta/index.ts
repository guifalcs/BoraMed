import { realDeps } from '../_shared/deps.ts';
import { handleCorrigirRespostaAberta } from './handler.ts';

// Entrypoint fino: toda a lógica vive em handler.ts (testável com deps fakes).
Deno.serve((req) => handleCorrigirRespostaAberta(req, realDeps()));
