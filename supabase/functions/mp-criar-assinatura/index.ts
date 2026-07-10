import { realDeps } from "../_shared/deps.ts";
import { handleCriarAssinatura } from "./handler.ts";

// Entrypoint fino: toda a lógica vive em handler.ts (testável com deps fakes).
Deno.serve((req) => handleCriarAssinatura(req, realDeps()));
