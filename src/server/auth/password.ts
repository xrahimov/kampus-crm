import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id with the OWASP-recommended "19 MiB, t=2, p=1" profile.
 * Hashes are PHC strings, so parameters can be raised later and old hashes
 * still verify.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed hash in the database must read as "does not match", not crash login.
    return false;
  }
}
