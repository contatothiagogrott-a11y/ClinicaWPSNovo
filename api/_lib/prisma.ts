import { PrismaClient } from "@prisma/client";

// Em ambiente serverless (Vercel), cada invocação pode reaproveitar o mesmo
// processo (warm start). Guardamos a instância em global para não abrir
// uma conexão nova com o Neon a cada chamada.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
