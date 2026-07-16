import crypto from "crypto";

/**
 * Criptografia de campo (application-level encryption) para dados sensíveis
 * da LGPD (nome, telefone, prontuário, resultados de testes, etc).
 *
 * Algoritmo: AES-256-GCM (autenticado — detecta qualquer adulteração).
 * A chave vem de ENCRYPTION_KEY (variável de ambiente), nunca do código.
 *
 * Formato armazenado no banco: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 20) {
    throw new Error(
      "ENCRYPTION_KEY não configurada (ou muito curta). Defina uma string aleatória longa (20+ caracteres) nas variáveis de ambiente."
    );
  }
  // Aceita QUALQUER string longa e aleatória (não precisa ser base64 nem ter
  // tamanho exato) — derivamos uma chave de 32 bytes com SHA-256. Isso permite
  // gerar o segredo em qualquer gerenciador de senhas, sem precisar de terminal.
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function encryptField(plainText: string | null | undefined): string {
  if (plainText === null || plainText === undefined) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptField(stored: string | null | undefined): string {
  if (!stored) return "";
  const parts = stored.split(".");
  if (parts.length !== 3) {
    // Dado legado / não criptografado — retorna como veio para não quebrar a tela.
    return stored;
  }
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "[não foi possível decriptar]";
  }
}
