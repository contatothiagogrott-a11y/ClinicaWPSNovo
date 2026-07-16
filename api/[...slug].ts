import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "./_lib/app.js";

// A Vercel roteia qualquer chamada a /api/* para esta função (nome de arquivo
// com [...slug] = "catch-all"). Todo o roteamento real acontece dentro do
// Express app (api/_lib/app.ts), então isso conta como UMA função serverless
// só, mesmo com dezenas de rotas — mais simples e mais barato de rodar.
export default function handler(req: VercelRequest, res: VercelResponse) {
  return (app as unknown as (req: VercelRequest, res: VercelResponse) => void)(req, res);
}
