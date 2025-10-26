'use client';
import { app, db } from "./firebaseClient";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
  addDoc, collection, onSnapshot, orderBy, query, where,
  deleteDoc, increment, runTransaction, getDocs, limit,
  GeoPoint, Timestamp,
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
  locationPrivate?: boolean;
  caption?: string;
  trophy?: boolean;
  file: File;
  captureDate?: string | null;
  captureTime?: string | null;
  capturedAt?: Date | null;
  coordinates?: { lat: number; lng: number } | null;
};

export type CatchWithCoordinates = {
  id: string;
  species: string;
  weight?: string | null;
  location?: string | null;
  caption?: string | null;
  displayName?: string | null;
  userPhoto?: string | null;
  coordinates: { lat: number; lng: number };
  locationPrivate?: boolean | null;
  createdAt?: Date | null;
  capturedAt?: Date | null;
  imageUrl?: string | null;
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

export async function followUser(currentUid: string, targetUid: string) {
  if (!currentUid || !targetUid || currentUid === targetUid) return;

  const currentRef = doc(db, 'users', currentUid);
  const targetRef = doc(db, 'users', targetUid);

  await runTransaction(db, async (tx) => {
    const targetSnap = await tx.get(targetRef);
    const currentSnap = await tx.get(currentRef);

    if (!targetSnap.exists()) throw new Error('Target user not found');
    if (!currentSnap.exists()) throw new Error('Current user not found');

    const targetData = targetSnap.data() || {};
    const currentData = currentSnap.data() || {};

    const targetFollowers = new Set<string>(Array.isArray(targetData.followers) ? targetData.followers : []);
    const currentFollowing = new Set<string>(Array.isArray(currentData.following) ? currentData.following : []);

    if (!targetFollowers.has(currentUid)) {
      targetFollowers.add(currentUid);
    }
    if (!currentFollowing.has(targetUid)) {
      currentFollowing.add(targetUid);
    }

    tx.update(targetRef, { followers: Array.from(targetFollowers) });
    tx.update(currentRef, { following: Array.from(currentFollowing) });
  });
}

export async function unfollowUser(currentUid: string, targetUid: string) {
  if (!currentUid || !targetUid || currentUid === targetUid) return;

  const currentRef = doc(db, 'users', currentUid);
  const targetRef = doc(db, 'users', targetUid);

  await runTransaction(db, async (tx) => {
    const targetSnap = await tx.get(targetRef);
    const currentSnap = await tx.get(currentRef);

    if (!targetSnap.exists()) throw new Error('Target user not found');
    if (!currentSnap.exists()) throw new Error('Current user not found');

    const targetData = targetSnap.data() || {};
    const currentData = currentSnap.data() || {};

    const targetFollowers = new Set<string>(Array.isArray(targetData.followers) ? targetData.followers : []);
    const currentFollowing = new Set<string>(Array.isArray(currentData.following) ? currentData.following : []);

    if (targetFollowers.has(currentUid)) {
      targetFollowers.delete(currentUid);
    }
    if (currentFollowing.has(targetUid)) {
      currentFollowing.delete(targetUid);
    }

    tx.update(targetRef, { followers: Array.from(targetFollowers) });
    tx.update(currentRef, { following: Array.from(currentFollowing) });
  });
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
  await uploadBytes(storageRef, input.file);

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
    locationPrivate: !!input.locationPrivate,
    hashtags,
    imageUrl,
    trophy: !!input.trophy,
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
    captureDate: input.captureDate || null,
    captureTime: input.captureTime || null,
    capturedAt: input.capturedAt ? Timestamp.fromDate(input.capturedAt) : null,
    coordinates:
      input.coordinates &&
      Number.isFinite(input.coordinates.lat) &&
      Number.isFinite(input.coordinates.lng)
        ? new GeoPoint(input.coordinates.lat, input.coordinates.lng)
        : null,
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

export function subscribeToCatchesWithCoordinates(cb: (arr: CatchWithCoordinates[]) => void) {
  const q = query(collection(db, "catches"));
  return onSnapshot(q, (snap) => {
    const arr: CatchWithCoordinates[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.locationPrivate) {
        return;
      }
      const coords = data.coordinates;
      if (!(coords instanceof GeoPoint)) return;

      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
      const capturedAt = data.capturedAt instanceof Timestamp ? data.capturedAt.toDate() : null;

      arr.push({
        id: docSnap.id,
        species: data.species || "",
        weight: data.weight ?? null,
        location: data.location ?? null,
        caption: data.caption ?? null,
        displayName: data.displayName ?? null,
        userPhoto: data.userPhoto ?? null,
        coordinates: { lat: coords.latitude, lng: coords.longitude },
        locationPrivate: data.locationPrivate ?? null,
        createdAt,
        capturedAt,
        imageUrl: data.imageUrl ?? null,
      });
    });

    arr.sort((a, b) => {
      const aTime = (a.capturedAt ?? a.createdAt)?.getTime() ?? 0;
      const bTime = (b.capturedAt ?? b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    });

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
const timestampToMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    if (typeof (value as any).toMillis === 'function') return (value as any).toMillis();
    if (value instanceof Date) return value.getTime();
    if ('seconds' in (value as any)) {
      const { seconds, nanoseconds = 0 } = value as { seconds: number; nanoseconds?: number };
      return seconds * 1000 + nanoseconds / 1e6;
    }
  }
  return 0;
};

export function subscribeToChallengeCatches(cb: (arr: any[]) => void) {
  const q = query(
    collection(db, "catches"),
    where("hashtags", "array-contains", "#HookdChallenge")
  );
  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    arr.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
    cb(arr.slice(0, 6));
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
  const docs = snap.docs.map((doc) => {
    const data = doc.data() as { createdAt?: any };
    return { id: doc.id, ...data };
  });

  return docs
    .sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    })
    .slice(0, 6);
}

