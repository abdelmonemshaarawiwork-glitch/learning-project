import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import { refs } from "@/lib/server/paths";

/**
 * Security rules, tested with the real client SDK against the emulators:
 * users can read only their own tree and can never write from the browser.
 */

let app: FirebaseApp;
let db: Firestore;
const pw = "rules-test-pw-1";
const emailA = `a_${Date.now()}@example.com`;
const emailB = `b_${Date.now()}@example.com`;
let uidA = "";
let uidB = "";

async function expectDenied(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: "permission-denied" });
}

beforeAll(async () => {
  app = initializeApp({ apiKey: "demo-key", projectId: "demo-study-quest", appId: "demo" }, "rules-test");
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  uidB = (await createUserWithEmailAndPassword(auth, emailB, pw)).user.uid;
  await signOut(auth);
  uidA = (await createUserWithEmailAndPassword(auth, emailA, pw)).user.uid;
  // Seed data with the Admin SDK (bypasses rules, like the server does).
  for (const uid of [uidA, uidB]) {
    await refs.user(uid).set({ uid, totalXp: 10 });
    await refs.quest(uid, "q1").set({ id: "q1", title: "Quest" });
    await refs.xp(uid).doc("mission_q1_m1").set({ amount: 20 });
  }
  await signInWithEmailAndPassword(auth, emailA, pw);
});

afterAll(async () => {
  for (const uid of [uidA, uidB]) await adminDb().recursiveDelete(refs.user(uid));
  await deleteApp(app);
});

describe("firestore.rules", () => {
  it("lets a user read their own documents", async () => {
    expect((await getDoc(doc(db, "users", uidA))).data()?.totalXp).toBe(10);
    expect((await getDocs(collection(db, "users", uidA, "quests"))).size).toBe(1);
    expect((await getDoc(doc(db, "users", uidA, "xpTransactions", "mission_q1_m1"))).exists()).toBe(true);
  });

  it("blocks reading another user's data", async () => {
    await expectDenied(getDoc(doc(db, "users", uidB)));
    await expectDenied(getDocs(collection(db, "users", uidB, "quests")));
    await expectDenied(getDoc(doc(db, "users", uidB, "xpTransactions", "mission_q1_m1")));
  });

  it("blocks every client write, including to the user's own XP and progress", async () => {
    await expectDenied(updateDoc(doc(db, "users", uidA), { totalXp: 99999 }));
    await expectDenied(setDoc(doc(db, "users", uidA, "xpTransactions", "forged"), { amount: 1000 }));
    await expectDenied(updateDoc(doc(db, "users", uidA, "quests", "q1"), { title: "hacked" }));
    await expectDenied(deleteDoc(doc(db, "users", uidA, "xpTransactions", "mission_q1_m1")));
    await expectDenied(setDoc(doc(db, "users", uidB, "quests", "evil"), { title: "x" }));
  });

  it("blocks collections outside the user tree", async () => {
    await expectDenied(getDocs(collection(db, "users")));
    await expectDenied(setDoc(doc(db, "anything", "x"), { a: 1 }));
  });

  it("blocks unauthenticated access", async () => {
    await signOut(getAuth(app));
    await expectDenied(getDoc(doc(db, "users", uidA)));
  });
});
