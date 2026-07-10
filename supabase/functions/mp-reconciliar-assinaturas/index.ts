import { realDeps } from "../_shared/deps.ts";
import { handleReconciliarAssinaturas } from "./handler.ts";

// Entrypoint fino: toda a lógica vive em handler.ts (testável com deps fakes).
Deno.serve((req) => handleReconciliarAssinaturas(req, realDeps()));
