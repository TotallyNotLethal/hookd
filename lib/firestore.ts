'use client';
import { app, db } from "./firebaseClient";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
  addDoc, collection, onSnapshot, orderBy, query, where,
  deleteDoc, increment, runTransaction, getDocs, limit,
  GeoPoint, Timestamp,
} from "firebase/firestore";
import { getStorage, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  DEFAULT_PROFILE_THEME,
  coerceProfileTheme,
} from "./profileThemeOptions";

// ✅ Define storage first
const storage = getStorage(app, "gs://hookd-b7ae6.firebasestorage.app");

// 🔥 Now you can safely log it
if (storage) {
  const testRef = ref(storage, "/");
}

type ProfileAssetType = "avatar" | "header";

const PROFILE_ASSET_PATH: Record<ProfileAssetType, (uid: string) => string> = {
  avatar: (uid) => `profiles/${uid}/avatar`,
  header: (uid) => `profiles/${uid}/header`,
};

export async function uploadProfileAsset(uid: string, file: File, type: ProfileAssetType) {
  const storageRef = ref(storage, PROFILE_ASSET_PATH[type](uid));
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return url;
}

/** ---------- Types ---------- */
export type HookdUser = {
  uid: string;
  displayName: string;
  username: string;
  photoURL?: string;
  header?: string;
  bio?: string;
  about?: string;
  trophies?: string[];
  followers?: string[];
  following?: string[];
  createdAt?: any;
  updatedAt?: any;
  isTester: boolean;
  profileTheme?: ProfileTheme;
};

export type ProfileAccentKey = "tide" | "ember" | "kelp" | "midnight";
export type ProfileTextureKey = "calm" | "dusk" | "midnight";
export type ProfileLayoutKey = "classic" | "spotlight";

export type ProfileTheme = {
  accentColor: ProfileAccentKey;
  backgroundTexture: ProfileTextureKey;
  layoutVariant: ProfileLayoutKey;
  featuredCatchId?: string | null;
};

export type ChatMessage = {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  createdAt: Date | null;
};

export type ChatPresence = {
  id: string;
  uid: string;
  lastActive: Date | null;
};

export type DirectMessageParticipantProfile = {
  displayName?: string | null;
  photoURL?: string | null;
};

export type DirectMessage = {
  id: string;
  text: string;
  senderUid: string;
  recipientUid: string;
  createdAt: Date | null;
  displayName?: string | null;
  photoURL?: string | null;
};

export type DirectMessageThread = {
  id: string;
  participants: string[];
  updatedAt: Date | null;
  lastMessage?: string | null;
  lastSenderUid?: string | null;
  participantProfiles?: Record<string, DirectMessageParticipantProfile> | null;
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
      header: undefined,
      bio: '',
      about: '',
      trophies: [],
      followers: [],
      following: [],
      isTester: false,             // ✅ default tester flag
      profileTheme: { ...DEFAULT_PROFILE_THEME },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(refUser, payload);
  } else {
    const existing = snap.data() as HookdUser;
    const updates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    const nextDisplayName = user.displayName || existing.displayName || 'Angler';
    if (nextDisplayName !== existing.displayName) {
      updates.displayName = nextDisplayName;
    }

    const hasExistingPhoto = typeof existing.photoURL === 'string' && existing.photoURL.trim().length > 0;
    if (!hasExistingPhoto) {
      updates.photoURL = user.photoURL || null;
    }

    if (!existing.profileTheme) {
      updates.profileTheme = { ...DEFAULT_PROFILE_THEME };
    }

    if (typeof existing.about !== 'string') {
      updates.about = '';
    }

    await updateDoc(refUser, updates);
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

export async function updateUserProfile(
  uid: string,
  data: {
    displayName?: string;
    bio?: string;
    photoURL?: string | null;
    header?: string | null;
    about?: string | null;
    profileTheme?: Partial<ProfileTheme> | null;
    [key: string]: any;
  },
) {
  const refUser = doc(db, 'users', uid);
  const { profileTheme, about, ...rest } = data;
  const payload: Record<string, any> = { ...rest, updatedAt: serverTimestamp() };

  if (about !== undefined) {
    payload.about = about ?? '';
  }

  if (profileTheme !== undefined) {
    const themeToPersist = profileTheme === null
      ? { ...DEFAULT_PROFILE_THEME }
      : coerceProfileTheme(profileTheme, DEFAULT_PROFILE_THEME);

    payload.profileTheme = themeToPersist;
  }

  await updateDoc(refUser, payload);
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

function computeDistanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function valueToMillis(value: any): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

export function subscribeToFollowingFeedCatches(
  followingIds: string[],
  cb: (arr: any[]) => void,
) {
  const cleaned = Array.from(
    new Set(followingIds.filter((id) => typeof id === 'string' && id.trim().length > 0)),
  );

  if (cleaned.length === 0) {
    cb([]);
    return () => {};
  }

  const chunkSize = 10;
  const chunkResults = new Map<number, Map<string, any>>();
  const unsubscribers: (() => void)[] = [];

  const emit = () => {
    const merged: any[] = [];
    chunkResults.forEach((map) => {
      map.forEach((value) => merged.push(value));
    });
    merged.sort((a, b) => valueToMillis(b.createdAt) - valueToMillis(a.createdAt));
    cb(merged);
  };

  for (let index = 0; index < cleaned.length; index += chunkSize) {
    const slice = cleaned.slice(index, index + chunkSize);
    const q = query(
      collection(db, 'catches'),
      where('uid', 'in', slice),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const map = new Map<string, any>();
      snap.forEach((docSnap) => {
        map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
      chunkResults.set(index, map);
      emit();
    });

    unsubscribers.push(unsubscribe);
  }

  return () => {
    unsubscribers.forEach((fn) => fn());
    chunkResults.clear();
  };
}

export function subscribeToLocalFeedCatches(
  center: { lat: number; lng: number },
  radiusMiles: number,
  cb: (arr: any[]) => void,
) {
  const q = query(collection(db, 'catches'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const results: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const coords = data.coordinates;
      if (!(coords instanceof GeoPoint)) return;
      const distance = computeDistanceMiles(center, {
        lat: coords.latitude,
        lng: coords.longitude,
      });
      if (distance <= radiusMiles) {
        results.push({ id: docSnap.id, ...data });
      }
    });
    results.sort((a, b) => valueToMillis(b.createdAt) - valueToMillis(a.createdAt));
    cb(results);
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

/** ---------- Chat Board ---------- */
export async function updateChatPresence(uid: string) {
  if (!uid) {
    throw new Error('A UID is required to update chat presence');
  }

  const ref = doc(db, 'chatPresence', uid);
  await setDoc(ref, { uid, lastActive: serverTimestamp() }, { merge: true });
}

export function subscribeToChatPresence(
  cb: (presence: ChatPresence[]) => void,
  options: { inactivityMs?: number; onError?: (error: Error) => void } = {},
) {
  const { inactivityMs = 60_000, onError } = options;
  const q = query(
    collection(db, 'chatPresence'),
    orderBy('lastActive', 'desc'),
    limit(100),
  );

  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const items: ChatPresence[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      const lastActiveMs = timestampToMillis(data.lastActive);
      const lastActive = lastActiveMs ? new Date(lastActiveMs) : null;

      if (lastActive && now - lastActive.getTime() > inactivityMs) {
        return;
      }

      items.push({
        id: docSnap.id,
        uid: typeof data.uid === 'string' && data.uid.trim() ? data.uid : docSnap.id,
        lastActive,
      });
    });

    cb(items);
  }, (error) => {
    console.error('Failed to subscribe to chat presence', error);
    if (onError) onError(error);
  });
}

export function subscribeToChatMessages(
  cb: (messages: ChatMessage[]) => void,
  options: { limit?: number; onError?: (error: Error) => void } = {},
) {
  const { limit: limitCount = 150, onError } = options;
  const q = query(
    collection(db, 'chatMessages'),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(q, (snap) => {
    const items: ChatMessage[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt && typeof data.createdAt.toDate === 'function'
          ? data.createdAt.toDate()
          : null;

      items.push({
        id: docSnap.id,
        text: typeof data.text === 'string' ? data.text : '',
        uid: data.uid || '',
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Angler',
        photoURL: data.photoURL ?? null,
        createdAt,
      });
    });

    items.sort((a, b) => {
      const aTime = a.createdAt?.getTime() ?? 0;
      const bTime = b.createdAt?.getTime() ?? 0;
      return aTime - bTime;
    });

    cb(items);
  }, (error) => {
    console.error('Failed to subscribe to chat messages', error);
    if (onError) onError(error);
  });
}

export async function sendChatMessage(data: {
  uid: string;
  displayName: string;
  text: string;
  photoURL?: string | null;
}) {
  const normalized = data.text.trim();
  if (!normalized) {
    throw new Error('Message cannot be empty');
  }

  await addDoc(collection(db, 'chatMessages'), {
    uid: data.uid,
    displayName: data.displayName,
    text: normalized.slice(0, 2000),
    photoURL: data.photoURL ?? null,
    createdAt: serverTimestamp(),
  });
}

export function getDirectMessageThreadId(uidA: string, uidB: string) {
  return [uidA, uidB].sort((a, b) => a.localeCompare(b)).join('__');
}

export function subscribeToDirectMessageThreads(
  uid: string,
  cb: (threads: DirectMessageThread[]) => void,
  options: { onError?: (error: Error) => void } = {},
) {
  const { onError } = options;
  const q = query(collection(db, 'directThreads'), where('participants', 'array-contains', uid));

  return onSnapshot(q, (snap) => {
    const items: DirectMessageThread[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      const updatedAt = data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : data.updatedAt && typeof data.updatedAt.toDate === 'function'
          ? data.updatedAt.toDate()
          : null;

      const participantProfiles = typeof data.participantProfiles === 'object' && data.participantProfiles !== null
        ? data.participantProfiles as Record<string, DirectMessageParticipantProfile>
        : null;

      items.push({
        id: docSnap.id,
        participants: Array.isArray(data.participants) ? data.participants : [],
        updatedAt,
        lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : null,
        lastSenderUid: typeof data.lastSenderUid === 'string' ? data.lastSenderUid : null,
        participantProfiles,
      });
    });

    items.sort((a, b) => {
      const aTime = a.updatedAt?.getTime() ?? 0;
      const bTime = b.updatedAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    cb(items);
  }, (error) => {
    console.error('Failed to subscribe to direct message threads', error);
    if (onError) onError(error);
  });
}

export function subscribeToDirectMessages(
  threadId: string,
  cb: (messages: DirectMessage[]) => void,
  options: { onError?: (error: Error) => void } = {},
) {
  const { onError } = options;
  const messagesRef = collection(db, 'directThreads', threadId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(q, (snap) => {
    const items: DirectMessage[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt && typeof data.createdAt.toDate === 'function'
          ? data.createdAt.toDate()
          : null;

      items.push({
        id: docSnap.id,
        text: typeof data.text === 'string' ? data.text : '',
        senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
        recipientUid: typeof data.recipientUid === 'string' ? data.recipientUid : '',
        createdAt,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        photoURL: data.photoURL ?? null,
      });
    });

    cb(items);
  }, (error) => {
    console.error('Failed to subscribe to direct messages', error);
    if (onError) onError(error);
  });
}

export async function sendDirectMessage(data: {
  senderUid: string;
  recipientUid: string;
  text: string;
  senderDisplayName: string;
  senderPhotoURL?: string | null;
  recipientDisplayName?: string | null;
  recipientPhotoURL?: string | null;
}) {
  const normalized = data.text.trim();
  if (!normalized) {
    throw new Error('Message cannot be empty');
  }

  const threadId = getDirectMessageThreadId(data.senderUid, data.recipientUid);
  const threadRef = doc(db, 'directThreads', threadId);
  const now = serverTimestamp();

  await setDoc(threadRef, {
    participants: [data.senderUid, data.recipientUid].sort((a, b) => a.localeCompare(b)),
    updatedAt: now,
    lastMessage: normalized.slice(0, 2000),
    lastSenderUid: data.senderUid,
    participantProfiles: {
      [data.senderUid]: {
        displayName: data.senderDisplayName || null,
        photoURL: data.senderPhotoURL ?? null,
      },
      [data.recipientUid]: {
        displayName: data.recipientDisplayName || null,
        photoURL: data.recipientPhotoURL ?? null,
      },
    },
  }, { merge: true });

  await addDoc(collection(threadRef, 'messages'), {
    text: normalized.slice(0, 2000),
    senderUid: data.senderUid,
    recipientUid: data.recipientUid,
    createdAt: now,
    displayName: data.senderDisplayName || null,
    photoURL: data.senderPhotoURL ?? null,
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

