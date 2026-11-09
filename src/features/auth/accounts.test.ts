import Dexie from 'dexie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, db, openDatabase } from '@/database/db';
import { createPatient } from '@/database/repositories/patients';
import { patientInput } from '@/tests/fixtures';
import {
  accountsDb,
  AuthError,
  changePassword,
  clearSession,
  createSession,
  deleteAccount,
  getAccount,
  LEGACY_DB_NAME,
  loadSession,
  MAX_FAILED_ATTEMPTS,
  resetAccountsForTests,
  signIn,
  signUp,
  updateProfile,
} from './accounts';
import { hashPassword, passwordProblem, passwordStrength, setPasswordIterationsForTests, verifyPassword } from './password';

const PW = 'Correct horse 42';
const user = (over: Partial<{ displayName: string; email: string; password: string; role: string }> = {}) => ({
  displayName: 'Dr Test',
  email: `user-${crypto.randomUUID()}@example.test`,
  password: PW,
  role: 'Registrar',
  ...over,
});

async function expectAuthError(p: Promise<unknown>, code: AuthError['code']) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AuthError);
  expect((err as AuthError).code).toBe(code);
  return err as AuthError;
}

beforeAll(() => setPasswordIterationsForTests(1_000));
afterAll(() => setPasswordIterationsForTests(null));
beforeEach(async () => {
  await resetAccountsForTests();
  clearSession();
});

describe('password hashing', () => {
  it('salts every hash and verifies only the right password', async () => {
    const a = await hashPassword(PW);
    const b = await hashPassword(PW);
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
    expect(a.algorithm).toBe('PBKDF2-SHA256');
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword('Correct horse 43', a)).toBe(false);
  });

  it('enforces the password rules', () => {
    expect(passwordProblem('short1')).toMatch(/at least 10/);
    expect(passwordProblem('onlyletterslong')).toMatch(/letters and numbers/);
    expect(passwordProblem('1234567890123')).toMatch(/letters and numbers/);
    expect(passwordProblem('janedoe2026x', 'janedoe@example.com')).toMatch(/email name/);
    expect(passwordProblem(PW, 'someone@example.com')).toBeNull();
    expect(passwordStrength('abcdefghij1')).toBeLessThan(passwordStrength('Abcdefghij1!xyz'));
  });
});

describe('sign-up', () => {
  it('creates an account with its own database and never stores the password', async () => {
    const input = user({ email: '  Mixed.Case@Example.TEST ' });
    const { account, adoptedExistingData } = await signUp(input);
    expect(adoptedExistingData).toBe(false);
    expect(account.email).toBe('mixed.case@example.test');
    expect(account.dbName).toBe(`burn-tool-u-${account.id}`);
    const stored = await accountsDb.accounts.get(account.id);
    expect(JSON.stringify(stored)).not.toContain(PW);
    expect(stored!.passwordHash.length).toBeGreaterThan(20);
  });

  it('rejects invalid input and duplicate emails (case-insensitive)', async () => {
    await expectAuthError(signUp(user({ email: 'not-an-email' })), 'invalid_input');
    await expectAuthError(signUp(user({ displayName: '  ' })), 'invalid_input');
    await expectAuthError(signUp(user({ password: 'short1' })), 'invalid_input');
    const first = user({ email: 'dup@example.test' });
    await signUp(first);
    await expectAuthError(signUp(user({ email: 'DUP@example.test' })), 'email_taken');
    expect(await accountsDb.accounts.count()).toBe(1);
  });
});

describe('sign-in', () => {
  it('signs in with the right password and gives the same error for a wrong password or unknown email', async () => {
    const input = user();
    const { account } = await signUp(input);
    const signedIn = await signIn(input.email.toUpperCase(), PW);
    expect(signedIn.id).toBe(account.id);
    expect(signedIn.lastLoginAt).toBeTruthy();
    const wrong = await expectAuthError(signIn(input.email, 'Wrong password 1'), 'invalid_credentials');
    const unknown = await expectAuthError(signIn('nobody@example.test', PW), 'invalid_credentials');
    expect(wrong.message).toBe(unknown.message);
  });

  it(`locks the account for a while after ${MAX_FAILED_ATTEMPTS} failed attempts`, async () => {
    const input = user();
    const { account } = await signUp(input);
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) await expectAuthError(signIn(input.email, `Wrong password ${i}`), 'invalid_credentials');
    await expectAuthError(signIn(input.email, 'Wrong password 9'), 'locked');
    // Even the right password is refused while locked.
    await expectAuthError(signIn(input.email, PW), 'locked');
    // After the lock expires, the right password works and the counter is reset.
    await accountsDb.accounts.update(account.id, { lockedUntil: new Date(Date.now() - 1000).toISOString() });
    await signIn(input.email, PW);
    const stored = await accountsDb.accounts.get(account.id);
    expect(stored!.failedAttempts).toBe(0);
    expect(stored!.lockedUntil).toBeNull();
  });
});

describe('account management', () => {
  it('updates the profile', async () => {
    const { account } = await signUp(user());
    const updated = await updateProfile(account.id, { displayName: ' Dr Renamed ', role: 'Consultant' });
    expect(updated.displayName).toBe('Dr Renamed');
    expect((await getAccount(account.id))!.role).toBe('Consultant');
  });

  it('changes the password only with the current password', async () => {
    const input = user();
    const { account } = await signUp(input);
    await expectAuthError(changePassword(account.id, 'Not the password 1', 'New password 77'), 'invalid_credentials');
    await expectAuthError(changePassword(account.id, PW, 'short'), 'invalid_input');
    await changePassword(account.id, PW, 'New password 77');
    await expectAuthError(signIn(input.email, PW), 'invalid_credentials');
    expect((await signIn(input.email, 'New password 77')).id).toBe(account.id);
  });

  it('deletes the account and its clinical database only with the password', async () => {
    const { account } = await signUp(user());
    await openDatabase(account.dbName);
    await createPatient(patientInput());
    await expectAuthError(deleteAccount(account.id, 'Wrong password 1', closeDatabase), 'invalid_credentials');
    expect(await Dexie.exists(account.dbName)).toBe(true);
    await deleteAccount(account.id, PW, closeDatabase);
    expect(await Dexie.exists(account.dbName)).toBe(false);
    expect(await getAccount(account.id)).toBeNull();
  });
});

describe('data isolation between accounts', () => {
  it('keeps each account’s patients in its own database', async () => {
    const a = (await signUp(user({ displayName: 'Dr A' }))).account;
    const b = (await signUp(user({ displayName: 'Dr B' }))).account;
    await openDatabase(a.dbName);
    await createPatient(patientInput({ name: 'Patient of A' }));
    expect(await db.patients.count()).toBe(1);

    await openDatabase(b.dbName);
    expect(db.name).toBe(b.dbName);
    expect(await db.patients.count()).toBe(0);

    await openDatabase(a.dbName);
    expect((await db.patients.toArray()).map((p) => p.name)).toEqual(['Patient of A']);
    closeDatabase();
  });

  it('gives records saved before accounts existed to the first account only', async () => {
    await openDatabase(LEGACY_DB_NAME);
    await createPatient(patientInput({ name: 'Existing patient' }));
    closeDatabase();

    const first = await signUp(user());
    expect(first.adoptedExistingData).toBe(true);
    expect(first.account.dbName).toBe(LEGACY_DB_NAME);
    const second = await signUp(user());
    expect(second.adoptedExistingData).toBe(false);
    expect(second.account.dbName).not.toBe(LEGACY_DB_NAME);
    await Dexie.delete(LEGACY_DB_NAME);
  });
});

describe('session', () => {
  it('stores a tab session by default and a device session when "keep me signed in" is chosen', async () => {
    const { account } = await signUp(user());
    createSession(account, false);
    expect(sessionStorage.getItem('burn-tool:session')).toBeTruthy();
    expect(localStorage.getItem('burn-tool:session')).toBeNull();
    expect(loadSession()!.userId).toBe(account.id);

    createSession(account, true);
    expect(sessionStorage.getItem('burn-tool:session')).toBeNull();
    expect(localStorage.getItem('burn-tool:session')).toBeTruthy();
    expect(loadSession()!.keepSignedIn).toBe(true);

    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('ignores and removes an expired session', async () => {
    const { account } = await signUp(user());
    const s = createSession(account, true);
    localStorage.setItem('burn-tool:session', JSON.stringify({ ...s, expiresAt: new Date(Date.now() - 1000).toISOString() }));
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem('burn-tool:session')).toBeNull();
  });

  it('never stores the password in the session', async () => {
    const { account } = await signUp(user());
    createSession(account, true);
    expect(localStorage.getItem('burn-tool:session')).not.toContain(PW);
  });
});
