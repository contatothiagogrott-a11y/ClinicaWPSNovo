/**
 * Servidor local para desenvolvimento (`npm run dev:api`).
 * A Vercel NÃO usa este arquivo em produção — lá, cada rota de api/*.ts
 * vira uma função serverless automaticamente. Isso aqui é só para você
 * testar a API na sua própria máquina antes de publicar.
 */
import "dotenv/config";
import app from "./_lib/app.js";

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 8787;

app.listen(PORT, () => {
  console.log(`API local rodando em http://localhost:${PORT}`);
});
