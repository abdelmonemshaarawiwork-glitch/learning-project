/**
 * Password hashing with Web Crypto: PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt,
 * 256-bit derived key. Passwords are never stored or logged.
 */
export const PBKDF2_ITERATIONS = 600_000;
export const PASSWORD_MIN_LENGTH = 10;

let iterationsOverride: number | null = null;
/** Tests only: lower the iteration count to keep the suite fast. */
export function setPasswordIterationsForTests(n: number | null) {
  iterationsOverride = n;
}
export const currentIterations = () => iterationsOverride ?? PBKDF2_ITERATIONS;

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: 'PBKDF2-SHA256';
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = currentIterations();
  return { hash: toB64(await derive(password, salt, iterations)), salt: toB64(salt), iterations, algorithm: 'PBKDF2-SHA256' };
}

export async function verifyPassword(password: string, stored: Pick<PasswordHash, 'hash' | 'salt' | 'iterations'>): Promise<boolean> {
  const actual = await derive(password, fromB64(stored.salt) as Uint8Array<ArrayBuffer>, stored.iterations);
  const expected = fromB64(stored.hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!; // constant-time comparison
  return diff === 0;
}

/** Returns a problem with the password, or null when acceptable. */
export function passwordProblem(password: string, email = ''): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use both letters and numbers.';
  if (email && password.toLowerCase().includes(email.split('@')[0]!.toLowerCase()) && email.split('@')[0]!.length >= 4)
    return 'Do not include your email name in the password.';
  return null;
}

/** 0–4 rough strength score for the meter (not a security guarantee). */
export function passwordStrength(password: string): number {
  let s = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) s++;
  if (password.length >= 14) s++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) s++;
  return s;
}
