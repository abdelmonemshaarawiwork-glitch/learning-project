/**
 * Local user accounts (no server).
 *
 * - Accounts live in a separate IndexedDB database ("burn-tool-accounts").
 * - Each account has its OWN clinical database ("burn-tool-u-<id>"), so patients and records of
 *   different users of this browser are never mixed.
 * - Passwords are stored only as salted PBKDF2 hashes. Accounts control access through the app's
 *   interface; they are not encryption: the browser's stored data is not encrypted.
 * - There is no password recovery (nothing is stored elsewhere). Back up regularly.
 */
import Dexie, { type EntityTable } from 'dexie';
import { z } from 'zod';
import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/ids';
import { currentIterations, hashPassword, passwordProblem, verifyPassword } from './password';

export interface LocalAccount {
  id: string;
  /** Lower-cased, unique on this browser. */
  email: string;
  displayName: string;
  role: string;
  passwordHash: string;
  salt: string;
  iterations: number;
  algorithm: 'PBKDF2-SHA256';
  /** IndexedDB database that holds this account's clinical data. */
  dbName: string;
  createdAt: string;
  lastLoginAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}

export type PublicAccount = Pick<LocalAccount, 'id' | 'email' | 'displayName' | 'role' | 'dbName' | 'createdAt' | 'lastLoginAt'>;

export class AccountsDB extends Dexie {
  accounts!: EntityTable<LocalAccount, 'id'>;
  constructor(name = 'burn-tool-accounts') {
    super(name);
    this.version(1).stores({ accounts: 'id, &email' });
  }
}

export let accountsDb = new AccountsDB();
export async function resetAccountsForTests(name = `burn-tool-accounts-test-${crypto.randomUUID()}`) {
  accountsDb.close();
  accountsDb = new AccountsDB(name);
  await accountsDb.open();
}

export const LEGACY_DB_NAME = 'burn-tool';
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_SECONDS = 60;

export type AuthErrorCode = 'invalid_credentials' | 'locked' | 'email_taken' | 'invalid_input' | 'not_found';
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const nameSchema = z.string().trim().min(1, 'Enter your name.').max(120);

const toPublic = (a: LocalAccount): PublicAccount => ({
  id: a.id,
  email: a.email,
  displayName: a.displayName,
  role: a.role,
  dbName: a.dbName,
  createdAt: a.createdAt,
  lastLoginAt: a.lastLoginAt,
});

async function legacyDatabaseHasData(): Promise<boolean> {
  try {
    if (!(await Dexie.exists(LEGACY_DB_NAME))) return false;
    const legacy = new Dexie(LEGACY_DB_NAME);
    await legacy.open();
    const has = legacy.tables.some((t) => t.name === 'patients') ? (await legacy.table('patients').count()) > 0 : false;
    legacy.close();
    return has;
  } catch {
    return false;
  }
}

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
  role?: string;
}

export async function signUp(input: SignUpInput): Promise<{ account: PublicAccount; adoptedExistingData: boolean }> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new AuthError('invalid_input', email.error.issues[0]!.message);
  const name = nameSchema.safeParse(input.displayName);
  if (!name.success) throw new AuthError('invalid_input', name.error.issues[0]!.message);
  const problem = passwordProblem(input.password, email.data);
  if (problem) throw new AuthError('invalid_input', problem);
  if (await accountsDb.accounts.where('email').equals(email.data).count()) throw new AuthError('email_taken', 'An account with this email already exists on this browser. Sign in instead.');

  // Data entered before accounts existed is given to the first account (never silently discarded).
  const adoptedExistingData = (await accountsDb.accounts.count()) === 0 && (await legacyDatabaseHasData());
  const id = newId();
  const ph = await hashPassword(input.password);
  const account: LocalAccount = {
    id,
    email: email.data,
    displayName: name.data,
    role: (input.role ?? '').trim().slice(0, 120),
    passwordHash: ph.hash,
    salt: ph.salt,
    iterations: ph.iterations,
    algorithm: ph.algorithm,
    dbName: adoptedExistingData ? LEGACY_DB_NAME : `burn-tool-u-${id}`,
    createdAt: nowIso(),
    lastLoginAt: nowIso(),
    failedAttempts: 0,
    lockedUntil: null,
  };
  try {
    await accountsDb.accounts.add(account);
  } catch (e) {
    if ((e as Error).name === 'ConstraintError') throw new AuthError('email_taken', 'An account with this email already exists on this browser. Sign in instead.');
    throw e;
  }
  return { account: toPublic(account), adoptedExistingData };
}

export async function signIn(emailInput: string, password: string): Promise<PublicAccount> {
  const email = emailInput.trim().toLowerCase();
  const account = await accountsDb.accounts.where('email').equals(email).first();
  const invalid = new AuthError('invalid_credentials', 'Email or password is incorrect.');
  if (!account) {
    // Spend comparable time so response time does not reveal whether the email exists.
    await verifyPassword(password, { hash: 'AAAA', salt: 'AAAAAAAAAAAAAAAAAAAAAA==', iterations: currentIterations() }).catch(() => false);
    throw invalid;
  }
  if (account.lockedUntil && account.lockedUntil > nowIso()) {
    const secs = Math.ceil((Date.parse(account.lockedUntil) - Date.now()) / 1000);
    throw new AuthError('locked', `Too many failed attempts. Try again in ${secs} seconds.`);
  }
  const ok = await verifyPassword(password, { hash: account.passwordHash, salt: account.salt, iterations: account.iterations });
  if (!ok) {
    const failed = account.failedAttempts + 1;
    const lock = failed >= MAX_FAILED_ATTEMPTS;
    await accountsDb.accounts.update(account.id, {
      failedAttempts: lock ? 0 : failed,
      lockedUntil: lock ? new Date(Date.now() + LOCK_SECONDS * 1000).toISOString() : null,
    });
    if (lock) throw new AuthError('locked', `Too many failed attempts. Try again in ${LOCK_SECONDS} seconds.`);
    throw invalid;
  }
  const lastLoginAt = nowIso();
  await accountsDb.accounts.update(account.id, { failedAttempts: 0, lockedUntil: null, lastLoginAt });
  return toPublic({ ...account, lastLoginAt });
}

export async function getAccount(id: string): Promise<PublicAccount | null> {
  const a = await accountsDb.accounts.get(id);
  return a ? toPublic(a) : null;
}

export async function updateProfile(id: string, changes: { displayName?: string; role?: string }): Promise<PublicAccount> {
  const a = await accountsDb.accounts.get(id);
  if (!a) throw new AuthError('not_found', 'Account not found.');
  const displayName = changes.displayName !== undefined ? nameSchema.parse(changes.displayName) : a.displayName;
  const role = changes.role !== undefined ? changes.role.trim().slice(0, 120) : a.role;
  await accountsDb.accounts.update(id, { displayName, role });
  return toPublic({ ...a, displayName, role });
}

export async function changePassword(id: string, current: string, next: string): Promise<void> {
  const a = await accountsDb.accounts.get(id);
  if (!a) throw new AuthError('not_found', 'Account not found.');
  if (!(await verifyPassword(current, { hash: a.passwordHash, salt: a.salt, iterations: a.iterations })))
    throw new AuthError('invalid_credentials', 'The current password is incorrect.');
  const problem = passwordProblem(next, a.email);
  if (problem) throw new AuthError('invalid_input', problem);
  const ph = await hashPassword(next);
  await accountsDb.accounts.update(id, { passwordHash: ph.hash, salt: ph.salt, iterations: ph.iterations, algorithm: ph.algorithm });
}

/** Permanently deletes the account AND its clinical database from this browser. */
export async function deleteAccount(id: string, password: string, closeActive?: () => void): Promise<void> {
  const a = await accountsDb.accounts.get(id);
  if (!a) throw new AuthError('not_found', 'Account not found.');
  if (!(await verifyPassword(password, { hash: a.passwordHash, salt: a.salt, iterations: a.iterations })))
    throw new AuthError('invalid_credentials', 'The password is incorrect.');
  closeActive?.();
  await Dexie.delete(a.dbName);
  await accountsDb.accounts.delete(id);
}

export async function countAccounts(): Promise<number> {
  return accountsDb.accounts.count();
}

/* ------------------------------------------------------------------ */
/* Session (this browser tab, or this device when "keep me signed in") */
/* ------------------------------------------------------------------ */

export interface Session {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  dbName: string;
  keepSignedIn: boolean;
  expiresAt: string;
}

const SESSION_KEY = 'burn-tool:session';
export const SESSION_HOURS = 12;
export const KEEP_SIGNED_IN_DAYS = 30;

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function createSession(a: PublicAccount, keepSignedIn: boolean): Session {
  const ms = keepSignedIn ? KEEP_SIGNED_IN_DAYS * 864e5 : SESSION_HOURS * 3600e3;
  const s: Session = { userId: a.id, email: a.email, displayName: a.displayName, role: a.role, dbName: a.dbName, keepSignedIn, expiresAt: new Date(Date.now() + ms).toISOString() };
  clearSession();
  saveSession(s);
  return s;
}

export function loadSession(): Session | null {
  // Accessing the storage objects themselves can throw (sandboxed frames, blocked site data).
  for (const getStore of [() => sessionStorage, () => localStorage]) {
    const raw = safe(() => getStore().getItem(SESSION_KEY));
    if (!raw) continue;
    const s = safe(() => JSON.parse(raw) as Session);
    if (s && s.userId && s.dbName && s.expiresAt > nowIso()) return s;
    safe(() => getStore().removeItem(SESSION_KEY));
  }
  return null;
}

/** Rewrites the stored session (e.g. after the profile name changed); keeps its expiry. */
export function saveSession(s: Session) {
  safe(() => (s.keepSignedIn ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s)));
}

export function clearSession() {
  safe(() => sessionStorage.removeItem(SESSION_KEY));
  safe(() => localStorage.removeItem(SESSION_KEY));
}
