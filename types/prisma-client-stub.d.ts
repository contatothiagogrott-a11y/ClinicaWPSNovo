/**
 * Stub de tipos do @prisma/client usado APENAS pela verificação de tipos da
 * API (`npm run typecheck:api`) em ambientes onde o cliente Prisma ainda não
 * foi gerado (CI sem acesso a binaries.prisma.sh, por exemplo).
 *
 * Depois de rodar `prisma generate`, os tipos reais têm precedência e este
 * arquivo deixa de ter efeito prático.
 */
declare module "@prisma/client" {
  export class PrismaClient {
    constructor(opts?: any);
    [key: string]: any;
    $disconnect(): Promise<void>;
  }
}
