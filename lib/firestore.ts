'use client';
import { app, db } from "./firebaseClient";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
  addDoc, collection, onSnapshot, orderBy, query, where,
  deleteDoc, increment, runTransaction, limit, getDocs
} from "firebase/firestore";
import { getStorage, getDownloadURL, ref, uploadBytes } from "firebase/storage";

// ✅ Define storage first
const storage = getStorage(app, "gs://hookd-b7ae6.firebasestorage.app");

// 🔥 Now you can safely log it
if (storage) {
  const testRef = ref(storage, "/");
}

/** ---------- Types ---------- */
export type HookdUser = {
  uid: string;
  displayName: string;
  username: string;
  photoURL?: string;
  bio?: string;
  trophies?: string[];
  followers?: string[];
  following?: string[];
  createdAt?: any;
  updatedAt?: any;
  isTester: boolean;
};

export type CatchInput = {
  uid: string;
  displayName: string;
  userPhoto?: string;
  species: string;
  weight?: string;
  location?: string;
  caption?: string;
  trophy?: boolean;
  file: File;
};

/** ---------- Users ---------- */
export async function ensureUserProfile(user: { uid: string; displayName: string | null; photoURL?: string | null; }) {
  const refUser = doc(db, 'users', user.uid);
  const snap = await getDoc(refUser);

  if (!snap.exists()) {
    const payload: HookdUser = {
      uid: user.uid,
      displayName: user.displayName || 'Angler',
      username: '',                // ✅ default username
      photoURL: user.photoURL || undefined,
      bio: '',
      trophies: [],
      followers: [],
      following: [],
      isTester: false,             // ✅ default tester flag
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(refUser, payload);
  } else {
    await updateDoc(refUser, {
      displayName: user.displayName || 'Angler',
      photoURL: user.photoURL || null,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function setUsername(uid: string, username: string) {
  // Normalize username (no spaces, lowercase)
  const clean = username.trim().toLowerCase();

  // Check if already taken
  const q = query(collection(db, "users"), where("username", "==", clean));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error("Username already taken");

  // Update user doc
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { username: clean, updatedAt: serverTimestamp() });
  return clean;
}

export async function updateUserProfile(uid: string, data: { displayName?: string; bio?: string }) {
  const refUser = doc(db, 'users', uid);
  await updateDoc(refUser, { ...data, updatedAt: serverTimestamp() });
}

export function subscribeToUser(uid: string, cb: (u: any | null) => void) {
  const refUser = doc(db, 'users', uid);
  return onSnapshot(refUser, (snap) => cb(snap.exists() ? { uid, ...snap.data() } : null));
}

export function subscribeToUserCatches(uid: string, cb: (arr: any[]) => void) {
  const q = query(collection(db, 'catches'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ---------- Catches ---------- */
export async function createCatch(input: CatchInput) {
  const path = `catches/${input.uid}/${crypto.randomUUID()}`;
  const storageRef = ref(storage, path);

  // ✅ Wait for the upload to finish
  const uploadResult = await uploadBytes(storageRef, input.file);

  // ✅ Fetch download URL AFTER upload completes
  const imageUrl = await getDownloadURL(storageRef);

  // Extract hashtags from the caption
  const hashtags = input.caption
    ? Array.from(input.caption.matchAll(/#[A-Za-z0-9_]+/g)).map((m) => m[0])
    : [];

  // ✅ Save Firestore document with image URL
  const cRef = await addDoc(collection(db, 'catches'), {
    uid: input.uid,
    userId: input.uid,
    displayName: input.displayName,
    userPhoto: input.userPhoto || null,
    species: input.species,
    weight: input.weight || '',
    location: input.location || '',
    caption: input.caption || '',
    hashtags,
    imageUrl,
    trophy: !!input.trophy,
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
  });

  return cRef.id;
}

export function subscribeToFeedCatches(cb: (arr: any[]) => void) {
  const q = query(collection(db, 'catches'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ---------- Likes (subcollection + counter) ---------- */
export async function toggleLike(catchId: string, uid: string) {
  const likeRef = doc(db, 'catches', catchId, 'likes', uid);
  const postRef = doc(db, 'catches', catchId);
  await runTransaction(db, async (tx) => {
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists()) {
      tx.delete(likeRef);
      tx.update(postRef, { likesCount: increment(-1) });
    } else {
      tx.set(likeRef, { uid, createdAt: serverTimestamp() });
      tx.update(postRef, { likesCount: increment(1) });
    }
  });
}

export function subscribeToUserLike(catchId: string, uid: string, cb: (liked: boolean) => void) {
  const likeRef = doc(db, 'catches', catchId, 'likes', uid);
  return onSnapshot(likeRef, (snap) => cb(snap.exists()));
}

export function subscribeToLikesCount(catchId: string, cb: (count: number) => void) {
  const postRef = doc(db, 'catches', catchId);
  return onSnapshot(postRef, (snap) => { if (snap.exists()) cb(snap.data().likesCount || 0); });
}

/** ---------- Challenge Catches ---------- */
export function subscribeToChallengeCatches(cb: (arr: any[]) => void) {
  const q = query(
    collection(db, "catches"),
    where("hashtags", "array-contains", "#HookdChallenge"),
    orderBy("createdAt", "desc"),
    limit(6)
  );
  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ---------- Comments ---------- */
export async function addComment(catchId: string, data: { uid: string; displayName: string; photoURL?: string; text: string; }) {
  const commentsCol = collection(db, 'catches', catchId, 'comments');
  await addDoc(commentsCol, { ...data, createdAt: serverTimestamp() });
  const postRef = doc(db, 'catches', catchId);
  await updateDoc(postRef, { commentsCount: increment(1) });
}

export function subscribeToComments(catchId: string, cb: (arr: any[]) => void) {
  const q = query(collection(db, 'catches', catchId, 'comments'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    cb(arr);
  });
}

/** ---------- Delete Catch ---------- */
export async function deleteCatch(catchId: string) {
  await deleteDoc(doc(db, 'catches', catchId));
}

export async function getChallengeCatches() {
  const q = query(
    collection(db, "catches"),
    where("hashtags", "array-contains", "#HookdChallenge"),
    orderBy("createdAt", "desc"),
    limit(6)
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
