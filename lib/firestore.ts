'use client';
import { FirebaseError } from "firebase/app";
import { app, db } from "./firebaseClient";
import { validateAndNormalizeUsername } from "./username";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp,
  addDoc, collection, onSnapshot, orderBy, query, where,
  deleteDoc, increment, runTransaction, getDocs, limit,
  GeoPoint, Timestamp, writeBatch, DocumentReference, Transaction, Query, DocumentData,
} from "firebase/firestore";
import { getStorage, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  DEFAULT_PROFILE_THEME,
  coerceProfileTheme,
} from "./profileThemeOptions";
import { updateUserTackleStatsForCatch } from "./tackleBox";
import type {
  EnvironmentBands,
  EnvironmentSnapshot,
} from "./environmentTypes";
import { deriveLocationKey } from "./location";

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

export const TEAM_LOGO_ALLOWED_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export const TEAM_LOGO_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const TEAM_ASSET_PATH = (teamId: string) => `team-logos/${teamId}`;

export async function uploadTeamAsset(teamId: string, file: File) {
  if (!TEAM_LOGO_ALLOWED_TYPES.has(file.type)) {
    throw new Error("Please choose a PNG, JPG, GIF, or WebP image for the team logo.");
  }

  if (file.size > TEAM_LOGO_MAX_FILE_SIZE_BYTES) {
    throw new Error("Team logos must be 5MB or smaller.");
  }

  const storageRef = ref(storage, TEAM_ASSET_PATH(teamId));
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
  isPro: boolean;
  profileTheme?: ProfileTheme;
  age?: number | null;
  badges?: string[];
  unreadNotificationsCount?: number;
  lastNotificationAt?: any;
  notificationPreferences?: NotificationPreferences;
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

export const MIN_PROFILE_AGE = 0;
export const MAX_PROFILE_AGE = 120;
export const LIL_ANGLER_BADGE = 'lil-angler';
export const LIL_ANGLER_MAX_AGE = 9;

export function normalizeUserAge(input: unknown): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.round(numeric);
    return Math.min(MAX_PROFILE_AGE, Math.max(MIN_PROFILE_AGE, rounded));
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const rounded = Math.round(input);
    return Math.min(MAX_PROFILE_AGE, Math.max(MIN_PROFILE_AGE, rounded));
  }

  return null;
}

export function sanitizeUserBadges(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const result: string[] = [];
  for (const badge of input) {
    if (typeof badge !== 'string') continue;
    const trimmed = badge.trim();
    if (!trimmed) continue;
    if (!result.includes(trimmed)) {
      result.push(trimmed);
    }
  }
  return result;
}

export function syncBadgesForAge(badges: string[], age: number | null): string[] {
  const sanitized = sanitizeUserBadges(badges);
  const hasLilAngler = sanitized.includes(LIL_ANGLER_BADGE);

  if (age != null && age <= LIL_ANGLER_MAX_AGE) {
    if (!hasLilAngler) sanitized.push(LIL_ANGLER_BADGE);
    return sanitized;
  }

  if (hasLilAngler) {
    return sanitized.filter((badge) => badge !== LIL_ANGLER_BADGE);
  }

  return sanitized;
}

export type ChatMessageMention = {
  uid: string;
  username: string;
  displayName?: string | null;
};

export type ChatMessage = {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  createdAt: Date | null;
  isPro: boolean;
  mentions?: ChatMessageMention[];
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

export type NotificationVerb =
  | 'follow'
  | 'direct_message'
  | 'like'
  | 'comment'
  | 'team_invite_accepted'
  | 'team_invite_canceled'
  | 'chat_mention'
  | 'followed_catch';

export const NOTIFICATION_PREFERENCE_KEYS = [
  'follow',
  'direct_message',
  'like',
  'comment',
  'team_invite_accepted',
  'team_invite_canceled',
  'chat_mention',
  'followed_catch',
] as const;

export type NotificationPreferenceKey = typeof NOTIFICATION_PREFERENCE_KEYS[number];

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  follow: true,
  direct_message: true,
  like: true,
  comment: true,
  team_invite_accepted: true,
  team_invite_canceled: true,
  chat_mention: true,
  followed_catch: true,
};

export type NotificationResource =
  | { type: 'user'; uid: string }
  | { type: 'catch'; catchId: string; ownerUid?: string | null }
  | { type: 'directThread'; threadId: string; otherUid?: string | null }
  | { type: 'team'; teamId: string }
  | { type: 'teamInvite'; teamId: string; inviteeUid?: string | null }
  | { type: 'chatMessage'; messageId: string };

export type Notification = {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorDisplayName?: string | null;
  actorUsername?: string | null;
  actorPhotoURL?: string | null;
  verb: NotificationVerb;
  resource: NotificationResource | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: Date | null;
  updatedAt?: Date | null;
  readAt?: Date | null;
};

type NotificationDocData = {
  recipientUid: string;
  actorUid: string;
  actorDisplayName?: string | null;
  actorUsername?: string | null;
  actorPhotoURL?: string | null;
  verb: NotificationVerb;
  resource?: NotificationResource | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: Timestamp | null | ReturnType<typeof serverTimestamp>;
  updatedAt?: Timestamp | null | ReturnType<typeof serverTimestamp>;
  readAt?: Timestamp | null | ReturnType<typeof serverTimestamp>;
};

const NOTIFICATIONS_COLLECTION = 'notifications';

function notificationsCollectionFor(uid: string) {
  return collection(db, NOTIFICATIONS_COLLECTION, uid, 'items');
}

function sanitizeNotificationResource(input: any): NotificationResource | null {
  if (!input || typeof input !== 'object') return null;
  const type = input.type;
  if (type === 'user' && typeof input.uid === 'string') {
    return { type: 'user', uid: input.uid };
  }
  if (type === 'catch' && typeof input.catchId === 'string') {
    return { type: 'catch', catchId: input.catchId, ownerUid: typeof input.ownerUid === 'string' ? input.ownerUid : null };
  }
  if (type === 'directThread' && typeof input.threadId === 'string') {
    return {
      type: 'directThread',
      threadId: input.threadId,
      otherUid: typeof input.otherUid === 'string' ? input.otherUid : null,
    };
  }
  if (type === 'team' && typeof input.teamId === 'string') {
    return { type: 'team', teamId: input.teamId };
  }
  if (type === 'teamInvite' && typeof input.teamId === 'string') {
    return {
      type: 'teamInvite',
      teamId: input.teamId,
      inviteeUid: typeof input.inviteeUid === 'string' ? input.inviteeUid : null,
    };
  }
  if (type === 'chatMessage' && typeof input.messageId === 'string') {
    return { type: 'chatMessage', messageId: input.messageId };
  }
  return null;
}

function sanitizeMetadata(input: any): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (!entries.length) return null;
  return Object.fromEntries(entries);
}

export function sanitizeNotificationPreferences(input: unknown): NotificationPreferences {
  const base: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };

  if (!input || typeof input !== 'object') {
    return base;
  }

  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'boolean') {
      base[key] = value;
    }
  }

  return base;
}

function deserializeNotification(id: string, data: NotificationDocData): Notification {
  const createdAt = data.createdAt instanceof Timestamp
    ? data.createdAt.toDate()
    : data.createdAt && typeof (data.createdAt as any).toDate === 'function'
      ? (data.createdAt as any).toDate()
      : null;

  const updatedAt = data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate()
    : data.updatedAt && typeof (data.updatedAt as any).toDate === 'function'
      ? (data.updatedAt as any).toDate()
      : null;

  const readAt = data.readAt instanceof Timestamp
    ? data.readAt.toDate()
    : data.readAt && typeof (data.readAt as any).toDate === 'function'
      ? (data.readAt as any).toDate()
      : null;

  return {
    id,
    recipientUid: data.recipientUid,
    actorUid: data.actorUid,
    actorDisplayName: data.actorDisplayName ?? null,
    actorUsername: data.actorUsername ?? null,
    actorPhotoURL: data.actorPhotoURL ?? null,
    verb: data.verb,
    resource: sanitizeNotificationResource(data.resource),
    metadata: sanitizeMetadata(data.metadata),
    isRead: Boolean(data.isRead),
    createdAt,
    updatedAt,
    readAt,
  };
}

function buildNotificationDoc(data: {
  recipientUid: string;
  actorUid: string;
  actorDisplayName?: string | null;
  actorUsername?: string | null;
  actorPhotoURL?: string | null;
  verb: NotificationVerb;
  resource?: NotificationResource | null;
  metadata?: Record<string, unknown> | null;
}) {
  const timestamp = serverTimestamp();
  return {
    recipientUid: data.recipientUid,
    actorUid: data.actorUid,
    actorDisplayName: data.actorDisplayName ?? null,
    actorUsername: data.actorUsername ?? null,
    actorPhotoURL: data.actorPhotoURL ?? null,
    verb: data.verb,
    resource: data.resource ?? null,
    metadata: sanitizeMetadata(data.metadata),
    isRead: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies NotificationDocData;
}

export function subscribeToNotifications(
  uid: string,
  cb: (notifications: Notification[]) => void,
  options: { limit?: number; onError?: (error: Error) => void } = {},
) {
  const { limit: limitCount = 50, onError } = options;
  const notificationsRef = notificationsCollectionFor(uid);
  const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(limitCount));

  return onSnapshot(q, (snapshot) => {
    const items: Notification[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as NotificationDocData;
      items.push(deserializeNotification(docSnap.id, data));
    });
    cb(items);
  }, (error) => {
    console.error('Failed to subscribe to notifications', error);
    if (onError) onError(error);
  });
}

export async function createNotification(data: {
  recipientUid: string;
  actorUid: string;
  actorDisplayName?: string | null;
  actorUsername?: string | null;
  actorPhotoURL?: string | null;
  verb: NotificationVerb;
  resource?: NotificationResource | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (!data.recipientUid || data.recipientUid === data.actorUid) {
    return;
  }

  const notificationsRef = notificationsCollectionFor(data.recipientUid);
  const notificationRef = doc(notificationsRef);
  const userRef = doc(db, 'users', data.recipientUid);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      return;
    }

    const userData = userSnap.data() as HookdUser;
    const preferences = sanitizeNotificationPreferences(userData.notificationPreferences);
    if (!preferences[data.verb]) {
      return;
    }

    tx.set(notificationRef, buildNotificationDoc(data));
    const timestamp = serverTimestamp();
    tx.update(userRef, {
      unreadNotificationsCount: increment(1),
      lastNotificationAt: timestamp,
    });
  });
}

export async function markNotificationAsRead(recipientUid: string, notificationId: string) {
  if (!recipientUid || !notificationId) return;

  const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, recipientUid, 'items', notificationId);
  const userRef = doc(db, 'users', recipientUid);

  await runTransaction(db, async (tx) => {
    const [notificationSnap, userSnap] = await Promise.all([
      tx.get(notificationRef),
      tx.get(userRef),
    ]);

    if (!notificationSnap.exists()) {
      return;
    }

    const notificationData = notificationSnap.data() as NotificationDocData;
    if (notificationData.isRead) {
      return;
    }

    tx.update(notificationRef, {
      isRead: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (userSnap.exists()) {
      const current = userSnap.data() as HookdUser;
      const count = typeof current.unreadNotificationsCount === 'number'
        ? Math.max(0, current.unreadNotificationsCount - 1)
        : 0;
      tx.update(userRef, { unreadNotificationsCount: count });
    }
  });
}

export async function markAllNotificationsAsRead(recipientUid: string) {
  if (!recipientUid) return;

  const notificationsRef = notificationsCollectionFor(recipientUid);
  const snapshot = await getDocs(query(notificationsRef, where('isRead', '==', false)));
  if (snapshot.empty) {
    return;
  }

  const userRef = doc(db, 'users', recipientUid);
  const batch = writeBatch(db);
  const timestamp = serverTimestamp();

  snapshot.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      isRead: true,
      readAt: timestamp,
      updatedAt: timestamp,
    });
  });

  batch.set(userRef, { unreadNotificationsCount: 0 }, { merge: true });
  await batch.commit();
}

export type DirectMessageThread = {
  id: string;
  participants: string[];
  updatedAt: Date | null;
  lastMessage?: string | null;
  lastSenderUid?: string | null;
  participantProfiles?: Record<string, DirectMessageParticipantProfile> | null;
};

export type Team = {
  id: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
  memberCount: number;
  pendingInviteUids: string[];
  logoURL?: string | null;
  chatChannelId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type TeamMembership = {
  teamId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type TeamInviteStatus = "pending" | "accepted" | "canceled";

export type TeamInvite = {
  id: string;
  teamId: string;
  inviteeUid: string;
  inviterUid: string;
  inviteeUsername: string;
  status: TeamInviteStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type TeamChatMessage = {
  id: string;
  teamId: string;
  text: string;
  uid: string;
  displayName: string;
  photoURL?: string | null;
  createdAt: Date | null;
};

type TeamArrays = {
  memberUids?: unknown;
  pendingInviteUids?: unknown;
};

export const TEAM_NAME_MIN_LENGTH = 3;

export function normalizeTeamName(name: string): string {
  if (typeof name !== "string") {
    throw new Error("Please provide a team name.");
  }

  const trimmed = name.trim();
  if (trimmed.length < TEAM_NAME_MIN_LENGTH) {
    throw new Error(`Team names must be at least ${TEAM_NAME_MIN_LENGTH} characters long.`);
  }

  return trimmed;
}

export function ensureProAccess(user: Pick<HookdUser, "isPro" | "uid"> | null | undefined) {
  if (!user?.isPro) {
    throw new Error("Teams are available for Pro members only.");
  }
}

export function addPendingInviteToTeamArrays(team: TeamArrays, inviteeUid: string): string[] {
  const pending = new Set<string>(
    Array.isArray(team.pendingInviteUids) ? team.pendingInviteUids.filter((item): item is string => typeof item === "string") : [],
  );
  pending.add(inviteeUid);
  return Array.from(pending);
}

export function applyAcceptedMemberToTeamArrays(team: TeamArrays, memberUid: string): {
  memberUids: string[];
  pendingInviteUids: string[];
  memberCount: number;
} {
  const memberSet = new Set<string>(
    Array.isArray(team.memberUids) ? team.memberUids.filter((item): item is string => typeof item === "string") : [],
  );
  memberSet.add(memberUid);

  const pendingSet = new Set<string>(
    Array.isArray(team.pendingInviteUids) ? team.pendingInviteUids.filter((item): item is string => typeof item === "string") : [],
  );
  pendingSet.delete(memberUid);

  return {
    memberUids: Array.from(memberSet),
    pendingInviteUids: Array.from(pendingSet),
    memberCount: memberSet.size,
  };
}

export function subscribeToTeamMembership(uid: string, cb: (membership: TeamMembership | null) => void) {
  const membershipRef = doc(db, 'teamMemberships', uid);
  return onSnapshot(membershipRef, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }

    const data = snap.data() as Record<string, any>;
    const createdAt = data.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : data.createdAt && typeof data.createdAt.toDate === 'function'
        ? data.createdAt.toDate()
        : null;

    const updatedAt = data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : data.updatedAt && typeof data.updatedAt.toDate === 'function'
        ? data.updatedAt.toDate()
        : null;

    cb({
      teamId: typeof data.teamId === 'string' && data.teamId ? data.teamId : null,
      createdAt,
      updatedAt,
    });
  });
}

async function deleteDocumentReferences(refs: DocumentReference[]): Promise<void> {
  if (refs.length === 0) return;

  const CHUNK_SIZE = 400;
  for (let index = 0; index < refs.length; index += CHUNK_SIZE) {
    const chunk = refs.slice(index, index + CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function deserializeTeam(docId: string, data: Record<string, any>): Team {
  const createdAt = data.createdAt instanceof Timestamp
    ? data.createdAt.toDate()
    : data.createdAt && typeof data.createdAt.toDate === "function"
      ? data.createdAt.toDate()
      : null;

  const updatedAt = data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate()
    : data.updatedAt && typeof data.updatedAt.toDate === "function"
      ? data.updatedAt.toDate()
      : null;

  return {
    id: docId,
    name: typeof data.name === "string" ? data.name : "Team",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    memberUids: Array.isArray(data.memberUids)
      ? data.memberUids.filter((value): value is string => typeof value === "string")
      : [],
    memberCount:
      typeof data.memberCount === "number" && Number.isFinite(data.memberCount)
        ? data.memberCount
        : Array.isArray(data.memberUids)
          ? data.memberUids.filter((value): value is string => typeof value === "string").length
          : 0,
    pendingInviteUids: Array.isArray(data.pendingInviteUids)
      ? data.pendingInviteUids.filter((value): value is string => typeof value === "string")
      : [],
    logoURL: typeof data.logoURL === "string" ? data.logoURL : data.logoURL ?? null,
    chatChannelId: typeof data.chatChannelId === "string" && data.chatChannelId
      ? data.chatChannelId
      : docId,
    createdAt,
    updatedAt,
  };
}

function deserializeTeamInvite(docId: string, data: Record<string, any>): TeamInvite {
  const createdAt = data.createdAt instanceof Timestamp
    ? data.createdAt.toDate()
    : data.createdAt && typeof data.createdAt.toDate === "function"
      ? data.createdAt.toDate()
      : null;

  const updatedAt = data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate()
    : data.updatedAt && typeof data.updatedAt.toDate === "function"
      ? data.updatedAt.toDate()
      : null;

  const status: TeamInviteStatus = data.status === "accepted" || data.status === "canceled"
    ? data.status
    : "pending";

  return {
    id: docId,
    teamId: typeof data.teamId === "string" ? data.teamId : "",
    inviteeUid: typeof data.inviteeUid === "string" ? data.inviteeUid : "",
    inviterUid: typeof data.inviterUid === "string" ? data.inviterUid : "",
    inviteeUsername: typeof data.inviteeUsername === "string" ? data.inviteeUsername : "",
    status,
    createdAt,
    updatedAt,
  };
}

export type CatchTackleInput = {
  lureType?: string | null;
  color?: string | null;
  rigging?: string | null;
  notes?: string | null;
  favoriteKey?: string | null;
};

export type CatchTackle = {
  lureType: string;
  color?: string | null;
  rigging?: string | null;
  notes?: string | null;
  favoriteKey?: string | null;
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
  captureWasCorrected?: boolean;
  captureManualEntry?: { captureDate?: string | null; captureTime?: string | null } | null;
  captureNormalizedAt?: Date | null;
  environmentSnapshot?: EnvironmentSnapshot | null;
  environmentBands?: EnvironmentBands | null;
  locationKey?: string | null;
  tackle?: CatchTackleInput | null;
};

export type CatchWithCoordinates = {
  id: string;
  species: string;
  uid?: string | null;
  userId?: string | null;
  weight?: string | null;
  location?: string | null;
  caption?: string | null;
  displayName?: string | null;
  userPhoto?: string | null;
  coordinates: { lat: number; lng: number };
  locationPrivate?: boolean | null;
  createdAt?: Timestamp | null;
  createdAtDate?: Date | null;
  capturedAt?: Timestamp | null;
  capturedAtDate?: Date | null;
  imageUrl?: string | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  trophy?: boolean | null;
  hashtags?: string[] | null;
  user?: Record<string, unknown> | null;
  tackle?: CatchTackle | null;
};

const MAX_FOLLOWER_NOTIFICATIONS_PER_CATCH = 200;
const CREATE_CATCH_NOTIFICATION_BATCH_SIZE = 20;

function sanitizeTackle(input: CatchTackleInput | null | undefined): CatchTackle | null {
  if (!input) return null;

  const lureType = typeof input.lureType === 'string' ? input.lureType.trim() : '';
  const color = typeof input.color === 'string' ? input.color.trim() : '';
  const rigging = typeof input.rigging === 'string' ? input.rigging.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const favoriteKey = typeof input.favoriteKey === 'string' ? input.favoriteKey.trim() : '';

  if (!lureType) {
    return null;
  }

  return {
    lureType,
    color: color || null,
    rigging: rigging || null,
    notes: notes || null,
    favoriteKey: favoriteKey || null,
  };
}

export const TOURNAMENTS_COLLECTION = 'tournaments';
export const TOURNAMENT_ENTRIES_COLLECTION = 'tournamentEntries';

export type TournamentMeasurementMode = 'weight' | 'length' | 'combined';
export type TournamentWeightUnit = 'lb' | 'kg';
export type TournamentLengthUnit = 'in' | 'cm';

export type TournamentAntiCheatFlags = {
  requireExif: boolean;
  requireOriginalPhoto: boolean;
  enforcePose: boolean;
};

export type TournamentMeasurement = {
  mode: TournamentMeasurementMode;
  weightUnit?: TournamentWeightUnit;
  lengthUnit?: TournamentLengthUnit;
};

export type Tournament = {
  id: string;
  title: string;
  description?: string | null;
  ruleset: string;
  measurement: TournamentMeasurement;
  requiredHashtags: string[];
  antiCheat: TournamentAntiCheatFlags;
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;
  isPublished: boolean;
  isArchived?: boolean;
  createdBy?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type TournamentVerificationSnapshot = {
  exifValidatedAt?: Timestamp | null;
  poseValidatedAt?: Timestamp | null;
  hasGps: boolean;
  captureTimestamp?: Timestamp | null;
  sha256?: string | null;
  missingHashtags: string[];
  metadataMismatch: boolean;
  poseSuspicious: boolean;
};

export type TournamentEntry = {
  id: string;
  tournamentId: string;
  catchId: string;
  userId: string;
  userDisplayName?: string | null;
  measurementMode: TournamentMeasurementMode;
  measurementUnit: {
    weight?: TournamentWeightUnit;
    length?: TournamentLengthUnit;
  };
  weightDisplay?: string | null;
  weightScore?: number | null;
  weightValue?: number | null;
  lengthDisplay?: string | null;
  lengthScore?: number | null;
  lengthValue?: number | null;
  scoreValue: number;
  scoreLabel: string;
  tournamentTitle?: string | null;
  measurementSummary?: string | null;
  createdAt?: Timestamp | null;
  verifiedAt?: Timestamp | null;
  verification: TournamentVerificationSnapshot;
  originalPhotoPath?: string | null;
};

export type ValidatedTournamentEntryPayload = {
  tournamentId: string;
  catchId: string;
  userId: string;
  userDisplayName?: string | null;
  tournamentTitle?: string | null;
  measurementMode: TournamentMeasurementMode;
  measurementUnit: {
    weight?: TournamentWeightUnit;
    length?: TournamentLengthUnit;
  };
  weightDisplay?: string | null;
  weightScore?: number | null;
  weightValue?: number | null;
  lengthDisplay?: string | null;
  lengthScore?: number | null;
  lengthValue?: number | null;
  scoreValue: number;
  scoreLabel: string;
  measurementSummary?: string | null;
  verification: TournamentVerificationSnapshot;
  originalPhotoPath?: string | null;
  metadata?: Record<string, unknown>;
};

export type TournamentLeaderboardEntry = TournamentEntry;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function mapTournamentData(id: string, data: Record<string, any>): Tournament {
  const measurementRaw = data.measurement ?? {};
  const measurement: TournamentMeasurement = {
    mode:
      measurementRaw.mode === 'length' || measurementRaw.mode === 'combined'
        ? measurementRaw.mode
        : 'weight',
    weightUnit:
      measurementRaw.weightUnit === 'kg' || measurementRaw.weightUnit === 'lb'
        ? measurementRaw.weightUnit
        : 'lb',
    lengthUnit:
      measurementRaw.lengthUnit === 'cm' || measurementRaw.lengthUnit === 'in'
        ? measurementRaw.lengthUnit
        : 'in',
  };

  const antiCheatRaw = data.antiCheat ?? {};
  const antiCheat: TournamentAntiCheatFlags = {
    requireExif: Boolean(antiCheatRaw.requireExif),
    requireOriginalPhoto: Boolean(antiCheatRaw.requireOriginalPhoto),
    enforcePose: Boolean(antiCheatRaw.enforcePose),
  };

  const startAt = data.startAt instanceof Timestamp ? data.startAt : null;
  const endAt = data.endAt instanceof Timestamp ? data.endAt : null;

  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Tournament',
    description: typeof data.description === 'string' ? data.description : null,
    ruleset: typeof data.ruleset === 'string' ? data.ruleset : '',
    measurement,
    requiredHashtags: normalizeStringArray(data.requiredHashtags),
    antiCheat,
    startAt,
    endAt,
    isPublished: Boolean(data.isPublished ?? true),
    isArchived: Boolean(data.isArchived ?? false),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : null,
  };
}

function tournamentIsActive(tournament: Tournament, now: Date): boolean {
  if (tournament.isArchived || !tournament.isPublished) {
    return false;
  }

  if (tournament.startAt instanceof Timestamp && tournament.startAt.toDate() > now) {
    return false;
  }

  if (tournament.endAt instanceof Timestamp && tournament.endAt.toDate() < now) {
    return false;
  }

  return true;
}

function mapTournamentEntryData(id: string, data: Record<string, any>): TournamentEntry {
  const verificationRaw = data.verification ?? {};
  const verification: TournamentVerificationSnapshot = {
    exifValidatedAt:
      verificationRaw.exifValidatedAt instanceof Timestamp
        ? verificationRaw.exifValidatedAt
        : null,
    poseValidatedAt:
      verificationRaw.poseValidatedAt instanceof Timestamp
        ? verificationRaw.poseValidatedAt
        : null,
    hasGps: Boolean(verificationRaw.hasGps),
    captureTimestamp:
      verificationRaw.captureTimestamp instanceof Timestamp
        ? verificationRaw.captureTimestamp
        : null,
    sha256: typeof verificationRaw.sha256 === 'string' ? verificationRaw.sha256 : null,
    missingHashtags: normalizeStringArray(verificationRaw.missingHashtags),
    metadataMismatch: Boolean(verificationRaw.metadataMismatch),
    poseSuspicious: Boolean(verificationRaw.poseSuspicious),
  };

  return {
    id,
    tournamentId: typeof data.tournamentId === 'string' ? data.tournamentId : '',
    catchId: typeof data.catchId === 'string' ? data.catchId : '',
    userId: typeof data.userId === 'string' ? data.userId : '',
    userDisplayName: typeof data.userDisplayName === 'string' ? data.userDisplayName : null,
    measurementMode:
      data.measurementMode === 'length' || data.measurementMode === 'combined'
        ? data.measurementMode
        : 'weight',
    measurementUnit: {
      weight:
        data.measurementUnit?.weight === 'kg' || data.measurementUnit?.weight === 'lb'
          ? data.measurementUnit.weight
          : undefined,
      length:
        data.measurementUnit?.length === 'cm' || data.measurementUnit?.length === 'in'
          ? data.measurementUnit.length
          : undefined,
    },
    weightDisplay: typeof data.weightDisplay === 'string' ? data.weightDisplay : null,
    weightScore:
      typeof data.weightScore === 'number' && Number.isFinite(data.weightScore)
        ? data.weightScore
        : null,
    weightValue:
      typeof data.weightValue === 'number' && Number.isFinite(data.weightValue)
        ? data.weightValue
        : null,
    lengthDisplay: typeof data.lengthDisplay === 'string' ? data.lengthDisplay : null,
    lengthScore:
      typeof data.lengthScore === 'number' && Number.isFinite(data.lengthScore)
        ? data.lengthScore
        : null,
    lengthValue:
      typeof data.lengthValue === 'number' && Number.isFinite(data.lengthValue)
        ? data.lengthValue
        : null,
    scoreValue:
      typeof data.scoreValue === 'number' && Number.isFinite(data.scoreValue)
        ? data.scoreValue
        : 0,
    scoreLabel: typeof data.scoreLabel === 'string' ? data.scoreLabel : '',
    tournamentTitle: typeof data.tournamentTitle === 'string' ? data.tournamentTitle : null,
    measurementSummary:
      typeof data.measurementSummary === 'string' ? data.measurementSummary : null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
    verifiedAt: data.verifiedAt instanceof Timestamp ? data.verifiedAt : null,
    verification,
    originalPhotoPath:
      typeof data.originalPhotoPath === 'string' ? data.originalPhotoPath : null,
  };
}

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
      isPro: false,
      profileTheme: { ...DEFAULT_PROFILE_THEME },
      age: null,
      badges: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
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

    if (typeof existing.isPro !== 'boolean') {
      updates.isPro = false;
    }

    const normalizedAge = normalizeUserAge(existing.age ?? null);
    if (existing.age !== normalizedAge) {
      updates.age = normalizedAge;
    }

    const normalizedBadges = syncBadgesForAge(existing.badges ?? [], normalizedAge);
    if (JSON.stringify(existing.badges ?? []) !== JSON.stringify(normalizedBadges)) {
      updates.badges = normalizedBadges;
    }

    const sanitizedPreferences = sanitizeNotificationPreferences(existing.notificationPreferences);
    if (
      !existing.notificationPreferences
      || JSON.stringify(existing.notificationPreferences) !== JSON.stringify(sanitizedPreferences)
    ) {
      updates.notificationPreferences = sanitizedPreferences;
    }

    await updateDoc(refUser, updates);
  }
}

export async function setUsername(uid: string, username: string) {
  // Validate and normalize username before checking Firestore uniqueness
  const clean = validateAndNormalizeUsername(username);

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
    isPro?: boolean;
    age?: number | null;
    badges?: string[] | null;
    [key: string]: any;
  },
) {
  const refUser = doc(db, 'users', uid);
  const { profileTheme, about, age, badges, ...rest } = data;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(refUser);
    const existing = snap.exists() ? (snap.data() as HookdUser) : ({} as HookdUser);

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

    let nextAge: number | null = normalizeUserAge(existing.age ?? null);
    if (age !== undefined) {
      nextAge = normalizeUserAge(age);
      payload.age = nextAge;
    }

    const existingBadges = sanitizeUserBadges(existing.badges);
    const baseBadges = badges !== undefined
      ? sanitizeUserBadges(badges ?? [])
      : existingBadges;

    const shouldSyncBadges = age !== undefined || badges !== undefined || !Array.isArray(existing.badges);
    if (shouldSyncBadges) {
      payload.badges = syncBadgesForAge(baseBadges, nextAge);
    }

    tx.set(refUser, payload, { merge: true });
  });
}

export async function getNotificationPreferences(uid: string | null | undefined): Promise<NotificationPreferences> {
  if (!uid) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const refUser = doc(db, 'users', uid);
  const snap = await getDoc(refUser);
  if (!snap.exists()) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const data = snap.data() as HookdUser;
  return sanitizeNotificationPreferences(data.notificationPreferences);
}

export async function updateNotificationPreferences(
  uid: string,
  preferences: Partial<NotificationPreferences>,
): Promise<void> {
  if (!uid) {
    throw new Error('A user ID is required to update notification preferences.');
  }

  const refUser = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(refUser);
    const existing = snap.exists()
      ? sanitizeNotificationPreferences((snap.data() as HookdUser).notificationPreferences)
      : { ...DEFAULT_NOTIFICATION_PREFERENCES };

    const next: NotificationPreferences = { ...existing };
    let changed = !snap.exists();

    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(preferences, key)) {
        continue;
      }

      const value = preferences[key];
      if (typeof value !== 'boolean') {
        continue;
      }

      if (next[key] !== value) {
        next[key] = value;
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    tx.set(refUser, {
      notificationPreferences: next,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export function subscribeToUser(uid: string, cb: (u: HookdUser | null) => void) {
  const refUser = doc(db, 'users', uid);
  return onSnapshot(refUser, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }

    const data = snap.data() as HookdUser;
    cb({
      ...data,
      uid,
      age: normalizeUserAge(data.age ?? null),
      badges: sanitizeUserBadges(data.badges),
      notificationPreferences: sanitizeNotificationPreferences(data.notificationPreferences),
    });
  });
}

export async function followUser(currentUid: string, targetUid: string) {
  if (!currentUid || !targetUid || currentUid === targetUid) return;

  const currentRef = doc(db, 'users', currentUid);
  const targetRef = doc(db, 'users', targetUid);

  let notificationPayload: Parameters<typeof createNotification>[0] | null = null;

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
      notificationPayload = {
        recipientUid: targetUid,
        actorUid: currentUid,
        actorDisplayName: typeof currentData.displayName === 'string' ? currentData.displayName : null,
        actorUsername: typeof currentData.username === 'string' ? currentData.username : null,
        actorPhotoURL: typeof currentData.photoURL === 'string' ? currentData.photoURL : null,
        verb: 'follow',
        resource: { type: 'user', uid: currentUid },
      };
    }
    if (!currentFollowing.has(targetUid)) {
      currentFollowing.add(targetUid);
    }

    tx.update(targetRef, { followers: Array.from(targetFollowers) });
    tx.update(currentRef, { following: Array.from(currentFollowing) });
  });

  if (notificationPayload) {
    await createNotification(notificationPayload);
  }
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

/** ---------- Teams ---------- */
export async function createTeam({
  ownerUid,
  name,
  logoFile,
}: {
  ownerUid: string;
  name: string;
  logoFile?: File | null;
}): Promise<Team> {
  const trimmedName = normalizeTeamName(name);
  const teamRef = doc(collection(db, 'teams'));
  const membershipRef = doc(db, 'teamMemberships', ownerUid);

  await runTransaction(db, async (tx) => {
    const ownerRef = doc(db, 'users', ownerUid);
    const ownerSnap = await tx.get(ownerRef);
    const membershipSnap = await tx.get(membershipRef);

    if (!ownerSnap.exists()) {
      throw new Error('We could not find your profile.');
    }

    const ownerData = ownerSnap.data() as HookdUser;
    ensureProAccess(ownerData);

    if (membershipSnap.exists()) {
      throw new Error('You are already part of a team.');
    }

    tx.set(teamRef, {
      name: trimmedName,
      ownerUid,
      memberUids: [ownerUid],
      memberCount: 1,
      pendingInviteUids: [],
      logoURL: null,
      chatChannelId: teamRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(membershipRef, {
      teamId: teamRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  if (logoFile) {
    const logoURL = await uploadTeamAsset(teamRef.id, logoFile);
    await updateDoc(teamRef, {
      logoURL,
      updatedAt: serverTimestamp(),
    });
  }

  const finalSnap = await getDoc(teamRef);
  if (!finalSnap.exists()) {
    throw new Error('Failed to create the team. Please try again.');
  }

  return deserializeTeam(teamRef.id, finalSnap.data() as Record<string, any>);
}

export async function updateTeamLogo(teamId: string, actorUid: string, file: File) {
  const teamRef = doc(db, 'teams', teamId);
  const actorRef = doc(db, 'users', actorUid);

  await runTransaction(db, async (tx) => {
    const [teamSnap, actorSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(actorRef),
    ]);

    if (!teamSnap.exists()) {
      throw new Error('Team not found.');
    }

    if (!actorSnap.exists()) {
      throw new Error('We could not verify your account.');
    }

    const teamData = teamSnap.data() as Record<string, any>;
    const actorData = actorSnap.data() as HookdUser;

    ensureProAccess(actorData);

    const members = Array.isArray(teamData.memberUids) ? teamData.memberUids : [];
    if (!members.includes(actorUid)) {
      throw new Error('Only team members can update the logo.');
    }

    if (teamData.ownerUid !== actorUid) {
      throw new Error('Only the team captain can update the logo.');
    }
  });

  const logoURL = await uploadTeamAsset(teamId, file);
  await updateDoc(teamRef, {
    logoURL,
    updatedAt: serverTimestamp(),
  });

  return logoURL;
}

export async function deleteTeam(teamId: string, actorUid: string): Promise<void> {
  const teamRef = doc(db, 'teams', teamId);
  const actorRef = doc(db, 'users', actorUid);

  await runTransaction(db, async (tx) => {
    const [teamSnap, actorSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(actorRef),
    ]);

    if (!teamSnap.exists()) {
      throw new Error('Team not found.');
    }

    if (!actorSnap.exists()) {
      throw new Error('We could not verify your account.');
    }

    const teamData = teamSnap.data() as Record<string, any>;
    if (teamData.ownerUid !== actorUid) {
      throw new Error('Only the team captain can delete this team.');
    }

    const members = Array.isArray(teamData.memberUids)
      ? teamData.memberUids.filter((value): value is string => typeof value === 'string')
      : [];

    members.forEach((uid) => {
      if (!uid) return;
      const membershipRef = doc(db, 'teamMemberships', uid);
      tx.delete(membershipRef);
    });

    tx.delete(teamRef);
  });

  const inviteSnap = await getDocs(query(collection(db, 'teamInvites'), where('teamId', '==', teamId)));
  const inviteRefs = inviteSnap.docs.map((docSnap) => docSnap.ref);
  await deleteDocumentReferences(inviteRefs);

  const messageSnap = await getDocs(collection(db, 'teamChats', teamId, 'messages'));
  const messageRefs = messageSnap.docs.map((docSnap) => docSnap.ref);
  await deleteDocumentReferences(messageRefs);

  await deleteDoc(doc(db, 'teamChats', teamId));
}

export async function inviteUserToTeam({
  teamId,
  inviterUid,
  inviteeUsername,
}: {
  teamId: string;
  inviterUid: string;
  inviteeUsername: string;
}): Promise<TeamInvite> {
  const normalizedUsername = validateAndNormalizeUsername(inviteeUsername);
  const userQuery = query(collection(db, 'users'), where('username', '==', normalizedUsername), limit(1));
  const inviteeSnap = await getDocs(userQuery);

  if (inviteeSnap.empty) {
    throw new Error('We could not find an angler with that username.');
  }

  const inviteeDoc = inviteeSnap.docs[0];
  const inviteeUid = inviteeDoc.id;
  const inviteRef = doc(db, 'teamInvites', `${teamId}__${inviteeUid}`);
  const teamRef = doc(db, 'teams', teamId);
  const inviterRef = doc(db, 'users', inviterUid);
  const membershipRef = doc(db, 'teamMemberships', inviteeUid);

  await runTransaction(db, async (tx) => {
    const [teamSnap, inviterSnap, inviteSnap, membershipSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(inviterRef),
      tx.get(inviteRef),
      tx.get(membershipRef),
    ]);

    if (!teamSnap.exists()) {
      throw new Error('Team not found.');
    }

    if (!inviterSnap.exists()) {
      throw new Error('We could not verify your account.');
    }

    const teamData = teamSnap.data() as Record<string, any>;
    const inviterData = inviterSnap.data() as HookdUser;
    const membershipData = membershipSnap.exists() ? membershipSnap.data() as Record<string, any> : null;

    ensureProAccess(inviterData);

    const activeTeamId = typeof membershipData?.teamId === 'string' ? membershipData.teamId : null;
    if (activeTeamId && activeTeamId !== teamId) {
      throw new Error('That angler is already part of another team.');
    }
    if (activeTeamId === teamId) {
      throw new Error('That angler is already on your team.');
    }

    const members = Array.isArray(teamData.memberUids)
      ? teamData.memberUids.filter((value): value is string => typeof value === 'string')
      : [];

    if (!members.includes(inviterUid)) {
      throw new Error('Only team members can send invites.');
    }

    if (teamData.ownerUid !== inviterUid) {
      throw new Error('Only the team captain can send invites.');
    }

    if (members.includes(inviteeUid)) {
      throw new Error('That angler is already on your team.');
    }

    const existingInvite = inviteSnap.exists() ? inviteSnap.data() as Record<string, any> : null;
    if (existingInvite?.status === 'pending') {
      throw new Error('That angler already has a pending invite.');
    }

    const pendingInviteUids = addPendingInviteToTeamArrays(teamData, inviteeUid);
    const now = serverTimestamp();

    tx.set(inviteRef, {
      teamId,
      inviteeUid,
      inviterUid,
      inviteeUsername: normalizedUsername,
      status: 'pending',
      createdAt: existingInvite?.createdAt ?? now,
      updatedAt: now,
    });

    tx.update(teamRef, {
      pendingInviteUids,
      updatedAt: now,
    });
  });

  const finalSnap = await getDoc(inviteRef);
  if (!finalSnap.exists()) {
    throw new Error('Failed to create the invite. Please try again.');
  }

  return deserializeTeamInvite(finalSnap.id, finalSnap.data() as Record<string, any>);
}

export async function cancelTeamInvite({
  teamId,
  inviteeUid,
  actorUid,
}: {
  teamId: string;
  inviteeUid: string;
  actorUid: string;
}): Promise<void> {
  const inviteRef = doc(db, 'teamInvites', `${teamId}__${inviteeUid}`);
  const teamRef = doc(db, 'teams', teamId);
  const actorRef = doc(db, 'users', actorUid);

  const notificationPayloads: Parameters<typeof createNotification>[0][] = [];

  await runTransaction(db, async (tx) => {
    const [inviteSnap, teamSnap, actorSnap] = await Promise.all([
      tx.get(inviteRef),
      tx.get(teamRef),
      tx.get(actorRef),
    ]);

    if (!inviteSnap.exists()) {
      throw new Error('Invite not found.');
    }

    if (!teamSnap.exists()) {
      throw new Error('Team not found.');
    }

    if (!actorSnap.exists()) {
      throw new Error('We could not verify your account.');
    }

    const inviteData = inviteSnap.data() as Record<string, any>;
    const teamData = teamSnap.data() as Record<string, any>;
    const actorData = actorSnap.data() as HookdUser;

    if (inviteData.status !== 'pending') {
      return;
    }

    const isOwner = teamData.ownerUid === actorUid;
    const isInviter = inviteData.inviterUid === actorUid;
    const isInvitee = inviteData.inviteeUid === actorUid;
    if (!isOwner && !isInviter && !isInvitee) {
      throw new Error('You cannot cancel this invite.');
    }

    const pendingInviteUids = new Set<string>(
      Array.isArray(teamData.pendingInviteUids)
        ? teamData.pendingInviteUids.filter((value): value is string => typeof value === 'string')
        : [],
    );
    pendingInviteUids.delete(inviteeUid);

    const now = serverTimestamp();

    tx.update(inviteRef, {
      status: 'canceled',
      updatedAt: now,
    });

    tx.update(teamRef, {
      pendingInviteUids: Array.from(pendingInviteUids),
      updatedAt: now,
    });

    const recipients = new Set<string>();
    const inviterUid = typeof inviteData.inviterUid === 'string' ? inviteData.inviterUid : null;
    const invitee = typeof inviteData.inviteeUid === 'string' ? inviteData.inviteeUid : null;
    const ownerUid = typeof teamData.ownerUid === 'string' ? teamData.ownerUid : null;

    if (inviterUid && inviterUid !== actorUid) {
      recipients.add(inviterUid);
    }
    if (invitee && invitee !== actorUid) {
      recipients.add(invitee);
    }
    if (ownerUid && ownerUid !== actorUid) {
      recipients.add(ownerUid);
    }

    const actorDisplayName = typeof actorData.displayName === 'string' ? actorData.displayName : null;
    const actorUsername = typeof actorData.username === 'string' ? actorData.username : null;
    const actorPhotoURL = typeof actorData.photoURL === 'string' ? actorData.photoURL : null;

    recipients.forEach((recipientUid) => {
      notificationPayloads.push({
        recipientUid,
        actorUid,
        actorDisplayName,
        actorUsername,
        actorPhotoURL,
        verb: 'team_invite_canceled',
        resource: { type: 'team', teamId },
        metadata: {
          teamId,
          inviteeUid,
        },
      });
    });
  });

  if (notificationPayloads.length) {
    await Promise.all(notificationPayloads.map((payload) => createNotification(payload)));
  }
}

export async function acceptTeamInvite({
  teamId,
  inviteeUid,
}: {
  teamId: string;
  inviteeUid: string;
}): Promise<void> {
  const inviteRef = doc(db, 'teamInvites', `${teamId}__${inviteeUid}`);
  const teamRef = doc(db, 'teams', teamId);
  const inviteeRef = doc(db, 'users', inviteeUid);
  const membershipRef = doc(db, 'teamMemberships', inviteeUid);

  const notificationPayloads: Parameters<typeof createNotification>[0][] = [];

  await runTransaction(db, async (tx) => {
    const [inviteSnap, teamSnap, inviteeSnap, membershipSnap] = await Promise.all([
      tx.get(inviteRef),
      tx.get(teamRef),
      tx.get(inviteeRef),
      tx.get(membershipRef),
    ]);

    if (!inviteSnap.exists()) {
      throw new Error('Invite not found.');
    }

    if (!teamSnap.exists()) {
      throw new Error('Team not found.');
    }

    if (!inviteeSnap.exists()) {
      throw new Error('We could not verify your account.');
    }

    const inviteData = inviteSnap.data() as Record<string, any>;
    if (inviteData.status !== 'pending') {
      throw new Error('This invite is no longer active.');
    }

    if (inviteData.inviteeUid !== inviteeUid) {
      throw new Error('This invite is assigned to a different angler.');
    }

    if (membershipSnap.exists()) {
      const membershipData = membershipSnap.data() as Record<string, any>;
      const existingTeamId = typeof membershipData.teamId === 'string' ? membershipData.teamId : null;
      if (existingTeamId && existingTeamId !== teamId) {
        throw new Error('You are already part of another team.');
      }
      if (existingTeamId === teamId) {
        throw new Error('You are already on this team.');
      }
      throw new Error('You are already part of a team.');
    }

    const teamData = teamSnap.data() as Record<string, any>;
    const { memberUids, pendingInviteUids, memberCount } = applyAcceptedMemberToTeamArrays(teamData, inviteeUid);
    const now = serverTimestamp();

    tx.update(teamRef, {
      memberUids,
      pendingInviteUids,
      memberCount,
      updatedAt: now,
    });

    tx.update(inviteRef, {
      status: 'accepted',
      updatedAt: now,
    });

    tx.set(membershipRef, {
      teamId,
      createdAt: now,
      updatedAt: now,
    });

    const inviteeData = inviteeSnap.data() as HookdUser;
    const recipients = new Set<string>();
    const inviterUid = typeof inviteData.inviterUid === 'string' ? inviteData.inviterUid : null;
    const ownerUid = typeof teamData.ownerUid === 'string' ? teamData.ownerUid : null;

    if (inviterUid && inviterUid !== inviteeUid) {
      recipients.add(inviterUid);
    }
    if (ownerUid && ownerUid !== inviteeUid) {
      recipients.add(ownerUid);
    }

    const actorDisplayName = typeof inviteeData.displayName === 'string' ? inviteeData.displayName : null;
    const actorUsername = typeof inviteeData.username === 'string' ? inviteeData.username : null;
    const actorPhotoURL = typeof inviteeData.photoURL === 'string' ? inviteeData.photoURL : null;

    recipients.forEach((recipientUid) => {
      notificationPayloads.push({
        recipientUid,
        actorUid: inviteeUid,
        actorDisplayName,
        actorUsername,
        actorPhotoURL,
        verb: 'team_invite_accepted',
        resource: { type: 'team', teamId },
        metadata: {
          teamId,
          inviteeUid,
        },
      });
    });
  });

  if (notificationPayloads.length) {
    await Promise.all(notificationPayloads.map((payload) => createNotification(payload)));
  }
}

export async function kickTeamMember({
  teamId,
  actorUid,
  targetUid,
}: {
  teamId: string;
  actorUid: string;
  targetUid: string;
}): Promise<void> {
  if (actorUid === targetUid) {
    throw new Error('Captains cannot remove themselves. Visit the teams dashboard to manage ownership.');
  }

  const teamRef = doc(db, 'teams', teamId);
  const actorRef = doc(db, 'users', actorUid);
  const targetRef = doc(db, 'users', targetUid);
  const membershipRef = doc(db, 'teamMemberships', targetUid);

  await runTransaction(db, async (tx) => {
    const [teamSnap, actorSnap, targetSnap, membershipSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(actorRef),
      tx.get(targetRef),
      tx.get(membershipRef),
    ]);

    if (!teamSnap.exists()) {
      throw new Error('Team not found.');
    }

    if (!actorSnap.exists()) {
      throw new Error('We could not verify your account.');
    }

    if (!targetSnap.exists()) {
      throw new Error('We could not verify the selected angler.');
    }

    const teamData = teamSnap.data() as Record<string, any>;

    if (teamData.ownerUid !== actorUid) {
      throw new Error('Only the team captain can remove members.');
    }

    if (teamData.ownerUid === targetUid) {
      throw new Error('You cannot remove the captain from the team.');
    }

    const members = new Set<string>(
      Array.isArray(teamData.memberUids)
        ? teamData.memberUids.filter((value): value is string => typeof value === 'string')
        : [],
    );

    if (!members.has(targetUid)) {
      throw new Error('That angler is not on your team.');
    }

    members.delete(targetUid);

    const pendingInvites = new Set<string>(
      Array.isArray(teamData.pendingInviteUids)
        ? teamData.pendingInviteUids.filter((value): value is string => typeof value === 'string')
        : [],
    );
    pendingInvites.delete(targetUid);

    const now = serverTimestamp();

    tx.update(teamRef, {
      memberUids: Array.from(members),
      pendingInviteUids: Array.from(pendingInvites),
      memberCount: members.size,
      updatedAt: now,
    });

    if (membershipSnap.exists()) {
      const membershipData = membershipSnap.data() as Record<string, any>;
      const membershipTeamId = typeof membershipData.teamId === 'string' ? membershipData.teamId : null;
      if (membershipTeamId === teamId) {
        tx.delete(membershipRef);
      }
    }
  });
}

export function subscribeToTeamsForUser(uid: string, cb: (teams: Team[]) => void) {
  const q = query(collection(db, 'teams'), where('memberUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const teams: Team[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      teams.push(deserializeTeam(docSnap.id, data));
    });
    teams.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    cb(teams);
  });
}

export function subscribeToTeam(teamId: string, cb: (team: Team | null) => void) {
  const ref = doc(db, 'teams', teamId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb(deserializeTeam(snap.id, snap.data() as Record<string, any>));
  });
}

export function subscribeToTeamInvitesForUser(uid: string, cb: (invites: TeamInvite[]) => void) {
  const q = query(
    collection(db, 'teamInvites'),
    where('inviteeUid', '==', uid),
    where('status', '==', 'pending'),
  );

  return onSnapshot(q, (snap) => {
    const invites: TeamInvite[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      invites.push(deserializeTeamInvite(docSnap.id, data));
    });
    invites.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    cb(invites);
  });
}

export function subscribeToTeamInvites(teamId: string, cb: (invites: TeamInvite[]) => void) {
  const q = query(
    collection(db, 'teamInvites'),
    where('teamId', '==', teamId),
    where('status', '==', 'pending'),
  );

  return onSnapshot(q, (snap) => {
    const invites: TeamInvite[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      invites.push(deserializeTeamInvite(docSnap.id, data));
    });
    invites.sort((a, b) => (a.inviteeUsername ?? '').localeCompare(b.inviteeUsername ?? ''));
    cb(invites);
  });
}

export async function fetchTopTeams(limitCount = 6): Promise<Team[]> {
  const q = query(collection(db, 'teams'), orderBy('memberCount', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  const teams: Team[] = [];
  snap.forEach((docSnap) => {
    teams.push(deserializeTeam(docSnap.id, docSnap.data() as Record<string, any>));
  });
  return teams;
}

export function subscribeToTeamChatMessages(
  teamId: string,
  cb: (messages: TeamChatMessage[]) => void,
  options: { limit?: number; onError?: (error: Error) => void } = {},
) {
  const { limit: limitCount = 150, onError } = options;
  const messagesRef = collection(db, 'teamChats', teamId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(limitCount));

  return onSnapshot(q, (snap) => {
    const items: TeamChatMessage[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt && typeof data.createdAt.toDate === 'function'
          ? data.createdAt.toDate()
          : null;

      items.push({
        id: docSnap.id,
        teamId,
        text: typeof data.text === 'string' ? data.text : '',
        uid: typeof data.uid === 'string' ? data.uid : '',
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Angler',
        photoURL: data.photoURL ?? null,
        createdAt,
      });
    });

    items.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    cb(items);
  }, (error) => {
    console.error('Failed to subscribe to team chat messages', error);
    if (onError) onError(error);
  });
}

export async function sendTeamChatMessage(teamId: string, data: {
  uid: string;
  displayName: string;
  text: string;
  photoURL?: string | null;
}) {
  const trimmed = data.text.trim();
  if (!trimmed) {
    throw new Error('Message cannot be empty');
  }

  const teamRef = doc(db, 'teams', teamId);
  const teamSnap = await getDoc(teamRef);
  if (!teamSnap.exists()) {
    throw new Error('Team not found.');
  }

  const teamData = teamSnap.data() as Record<string, any>;
  const members = Array.isArray(teamData.memberUids)
    ? teamData.memberUids.filter((value): value is string => typeof value === 'string')
    : [];

  if (!members.includes(data.uid)) {
    throw new Error('Only team members can post in this channel.');
  }

  await addDoc(collection(db, 'teamChats', teamId, 'messages'), {
    uid: data.uid,
    displayName: data.displayName,
    text: trimmed.slice(0, 2000),
    photoURL: data.photoURL ?? null,
    createdAt: serverTimestamp(),
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

  const normalizedCaptureTimestamp = (() => {
    if (input.captureNormalizedAt instanceof Date && !Number.isNaN(input.captureNormalizedAt.getTime())) {
      return Timestamp.fromDate(input.captureNormalizedAt);
    }
    if (input.environmentSnapshot?.normalizedCaptureUtc) {
      const normalized = new Date(input.environmentSnapshot.normalizedCaptureUtc);
      if (!Number.isNaN(normalized.getTime())) {
        return Timestamp.fromDate(normalized);
      }
    }
    if (input.capturedAt instanceof Date && !Number.isNaN(input.capturedAt.getTime())) {
      const floored = new Date(Math.floor(input.capturedAt.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
      return Timestamp.fromDate(floored);
    }
    return null;
  })();

  const locationKey = input.locationKey ?? deriveLocationKey({
    coordinates: input.coordinates ?? null,
    locationName: input.location ?? null,
  });

  const environmentSnapshot = input.environmentSnapshot
    ? { ...input.environmentSnapshot }
    : null;

  const environmentBands: EnvironmentBands | null = input.environmentBands
    ? { ...input.environmentBands }
    : environmentSnapshot
      ? {
          timeOfDay: environmentSnapshot.timeOfDayBand,
          moonPhase: environmentSnapshot.moonPhaseBand,
          pressure: environmentSnapshot.pressureBand,
        }
      : null;

  const captureManualEntry = input.captureManualEntry
    ? { ...input.captureManualEntry }
    : input.captureWasCorrected
      ? {
          captureDate: input.captureDate ?? null,
          captureTime: input.captureTime ?? null,
        }
      : null;

  const tackle = sanitizeTackle(input.tackle ?? null);

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
    captureNormalizedAt: normalizedCaptureTimestamp,
    captureWasCorrected: Boolean(input.captureWasCorrected),
    captureManualEntry: captureManualEntry || null,
    environmentSnapshot,
    environmentBands: environmentBands || null,
    tackle: tackle || null,
    coordinates:
      input.coordinates &&
      Number.isFinite(input.coordinates.lat) &&
      Number.isFinite(input.coordinates.lng)
        ? new GeoPoint(input.coordinates.lat, input.coordinates.lng)
        : null,
    locationKey: locationKey || null,
  });

  if (tackle) {
    const normalizedCaptureDate =
      input.capturedAt ?? (normalizedCaptureTimestamp ? new Date(normalizedCaptureTimestamp.toMillis()) : null);

    await updateUserTackleStatsForCatch({
      uid: input.uid,
      catchId: cRef.id,
      tackle,
      species: input.species,
      trophy: Boolean(input.trophy),
      capturedAt: normalizedCaptureDate ?? new Date(),
    });
  }

  if (locationKey) {
    void import('./biteClock')
      .then(({ refreshBiteSignalForCatch }) =>
        refreshBiteSignalForCatch({
          locationKey,
          coordinates: input.coordinates ?? null,
        }),
      )
      .catch((error) => {
        console.warn('Unable to refresh bite signal for catch', error);
      });
  }

  const posterSnap = await getDoc(doc(db, 'users', input.uid));
  const posterData = posterSnap.exists() ? (posterSnap.data() as Partial<HookdUser>) : null;

  const rawFollowers = Array.isArray(posterData?.followers) ? posterData?.followers : [];
  const followerUids: string[] = [];
  for (const followerUid of rawFollowers) {
    if (typeof followerUid !== 'string') continue;
    const trimmed = followerUid.trim();
    if (!trimmed || trimmed === input.uid) continue;
    followerUids.push(trimmed);
    if (followerUids.length >= MAX_FOLLOWER_NOTIFICATIONS_PER_CATCH) {
      break;
    }
  }

  if (followerUids.length > 0) {
    const actorDisplayName = typeof posterData?.displayName === 'string' && posterData.displayName.trim()
      ? posterData.displayName.trim()
      : (typeof input.displayName === 'string' && input.displayName.trim() ? input.displayName.trim() : null);
    const actorUsername = typeof posterData?.username === 'string' && posterData.username.trim()
      ? posterData.username.trim()
      : null;
    const actorPhotoURL = typeof posterData?.photoURL === 'string' && posterData.photoURL.trim()
      ? posterData.photoURL.trim()
      : (typeof input.userPhoto === 'string' && input.userPhoto.trim() ? input.userPhoto.trim() : null);

    const previewText = (() => {
      const caption = typeof input.caption === 'string' ? input.caption.trim() : '';
      if (caption) {
        return caption.length > 200 ? `${caption.slice(0, 197)}…` : caption;
      }
      const species = typeof input.species === 'string' ? input.species.trim() : '';
      if (!species) return null;
      const location = input.locationPrivate ? '' : (typeof input.location === 'string' ? input.location.trim() : '');
      if (location) {
        return `${species} • ${location}`;
      }
      return species;
    })();

    const baseMetadata: Record<string, unknown> = previewText
      ? { catchId: cRef.id, preview: previewText }
      : { catchId: cRef.id };

    const notificationPayloads = followerUids.map((recipientUid) => ({
      recipientUid,
      actorUid: input.uid,
      actorDisplayName: actorDisplayName ?? null,
      actorUsername: actorUsername ?? null,
      actorPhotoURL: actorPhotoURL ?? null,
      verb: 'followed_catch' as const,
      resource: { type: 'catch', catchId: cRef.id, ownerUid: input.uid } as const,
      metadata: { ...baseMetadata },
    } satisfies Parameters<typeof createNotification>[0]));

    for (let i = 0; i < notificationPayloads.length; i += CREATE_CATCH_NOTIFICATION_BATCH_SIZE) {
      const chunk = notificationPayloads.slice(i, i + CREATE_CATCH_NOTIFICATION_BATCH_SIZE);
      await Promise.all(chunk.map((payload) => createNotification(payload)));
    }
  }

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

export async function getCatchById(catchId: string) {
  if (!catchId) {
    return null;
  }

  try {
    const ref = doc(db, 'catches', catchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return null;
    }
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.error('Failed to load catch', error);
    return null;
  }
}

export function subscribeToTeamFeedCatches(memberUids: string[], cb: (arr: any[]) => void) {
  const cleaned = Array.from(
    new Set(
      memberUids
        .filter((uid): uid is string => typeof uid === 'string')
        .map((uid) => uid.trim())
        .filter((uid) => uid.length > 0),
    ),
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
    const q = query(collection(db, 'catches'), where('uid', 'in', slice));
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

export function subscribeToCatchesWithCoordinates(
  cb: (arr: CatchWithCoordinates[]) => void,
  options?: { allowedUids?: string[] | null },
) {
  const allowed = Array.isArray(options?.allowedUids)
    ? Array.from(
        new Set(
          options.allowedUids
            .filter((uid): uid is string => typeof uid === 'string')
            .map((uid) => uid.trim())
            .filter((uid) => uid.length > 0),
        ),
      )
    : null;

  if (allowed && allowed.length === 0) {
    cb([]);
    return () => {};
  }

  const convert = (docSnap: any): CatchWithCoordinates | null => {
    const data = docSnap.data();
    if (data.locationPrivate) {
      return null;
    }

    const coords = data.coordinates;
    if (!(coords instanceof GeoPoint)) return null;

    const createdAtTimestamp = data.createdAt instanceof Timestamp ? data.createdAt : null;
    const capturedAtTimestamp = data.capturedAt instanceof Timestamp ? data.capturedAt : null;

    return {
      id: docSnap.id,
      species: data.species || "",
      uid: data.uid ?? data.userId ?? null,
      userId: data.userId ?? data.uid ?? null,
      weight: data.weight ?? null,
      location: data.location ?? null,
      caption: data.caption ?? null,
      displayName: data.displayName ?? data.user?.name ?? null,
      userPhoto: data.userPhoto ?? null,
      coordinates: { lat: coords.latitude, lng: coords.longitude },
      locationPrivate: data.locationPrivate ?? null,
      createdAt: createdAtTimestamp,
      createdAtDate: createdAtTimestamp ? createdAtTimestamp.toDate() : null,
      capturedAt: capturedAtTimestamp,
      capturedAtDate: capturedAtTimestamp ? capturedAtTimestamp.toDate() : null,
      imageUrl: data.imageUrl ?? null,
      likesCount: typeof data.likesCount === 'number' ? data.likesCount : null,
      commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : null,
      trophy: typeof data.trophy === 'boolean' ? data.trophy : null,
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : null,
      user: typeof data.user === 'object' && data.user !== null ? data.user : null,
    };
  };

  const emit = (maps: Map<number, Map<string, CatchWithCoordinates>>) => {
    const merged: CatchWithCoordinates[] = [];
    maps.forEach((map) => {
      map.forEach((value) => merged.push(value));
    });

    merged.sort((a, b) => {
      const aDate = a.capturedAtDate ?? a.createdAtDate ?? null;
      const bDate = b.capturedAtDate ?? b.createdAtDate ?? null;
      const aTime = aDate ? aDate.getTime() : 0;
      const bTime = bDate ? bDate.getTime() : 0;
      return bTime - aTime;
    });

    cb(merged);
  };

  if (!allowed) {
    const q = query(collection(db, 'catches'));
    return onSnapshot(q, (snap) => {
      const arr: CatchWithCoordinates[] = [];
      snap.forEach((docSnap) => {
        const converted = convert(docSnap);
        if (converted) {
          arr.push(converted);
        }
      });

      arr.sort((a, b) => {
        const aDate = a.capturedAtDate ?? a.createdAtDate ?? null;
        const bDate = b.capturedAtDate ?? b.createdAtDate ?? null;
        const aTime = aDate ? aDate.getTime() : 0;
        const bTime = bDate ? bDate.getTime() : 0;
        return bTime - aTime;
      });

      cb(arr);
    });
  }

  const chunkSize = 10;
  const chunkResults = new Map<number, Map<string, CatchWithCoordinates>>();
  const unsubscribers: (() => void)[] = [];

  for (let index = 0; index < allowed.length; index += chunkSize) {
    const slice = allowed.slice(index, index + chunkSize);
    const q = query(collection(db, 'catches'), where('uid', 'in', slice));
    const unsubscribe = onSnapshot(q, (snap) => {
      const map = new Map<string, CatchWithCoordinates>();
      snap.forEach((docSnap) => {
        const converted = convert(docSnap);
        if (converted) {
          map.set(docSnap.id, converted);
        }
      });
      chunkResults.set(index, map);
      emit(chunkResults);
    });

    unsubscribers.push(unsubscribe);
  }

  return () => {
    unsubscribers.forEach((fn) => fn());
    chunkResults.clear();
  };
}

/** ---------- Likes (subcollection + counter) ---------- */
export async function toggleLike(catchId: string, uid: string) {
  const likeRef = doc(db, 'catches', catchId, 'likes', uid);
  const postRef = doc(db, 'catches', catchId);
  const actorSnap = await getDoc(doc(db, 'users', uid));
  const actorData = actorSnap.exists() ? (actorSnap.data() as HookdUser) : null;
  let notificationPayload: Parameters<typeof createNotification>[0] | null = null;

  await runTransaction(db, async (tx) => {
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists()) {
      throw new Error('Catch not found');
    }

    const postData = postSnap.data() as Record<string, any>;
    const catchOwnerUid = typeof postData.uid === 'string' ? postData.uid : null;
    const likeSnap = await tx.get(likeRef);

    if (likeSnap.exists()) {
      tx.delete(likeRef);
      tx.update(postRef, { likesCount: increment(-1) });
    } else {
      tx.set(likeRef, { uid, createdAt: serverTimestamp() });
      tx.update(postRef, { likesCount: increment(1) });

      if (catchOwnerUid && catchOwnerUid !== uid) {
        notificationPayload = {
          recipientUid: catchOwnerUid,
          actorUid: uid,
          actorDisplayName: actorData?.displayName ?? null,
          actorUsername: actorData?.username ?? null,
          actorPhotoURL: actorData?.photoURL ?? null,
          verb: 'like',
          resource: { type: 'catch', catchId, ownerUid: catchOwnerUid },
          metadata: { catchId },
        };
      }
    }
  });

  if (notificationPayload) {
    await createNotification(notificationPayload);
  }
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

const CHALLENGE_HASHTAG = "#HookdChallenge";
const CHALLENGE_LIMIT = 6;

type ChallengeCatchSnapshot = { id: string; createdAt?: any } & Record<string, unknown>;

function sortChallengeCatches<T extends ChallengeCatchSnapshot>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt))
    .slice(0, CHALLENGE_LIMIT);
}

async function fetchChallengeCatchDocs(challengeQuery: Query<DocumentData>) {
  const snap = await getDocs(challengeQuery);
  const docs = snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown> & { createdAt?: any };
    return { id: docSnap.id, ...data };
  });
  return sortChallengeCatches(docs);
}

export function subscribeToChallengeCatches(cb: (arr: any[]) => void) {
  const q = query(
    collection(db, "catches"),
    where("hashtags", "array-contains", CHALLENGE_HASHTAG)
  );
  return onSnapshot(q, (snap) => {
    const catches = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    cb(sortChallengeCatches(catches));
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

      const rawMentions = Array.isArray(data.mentions)
        ? data.mentions
        : [];

      const mentions = rawMentions.reduce<ChatMessageMention[]>((acc, mention) => {
        if (!mention || typeof mention !== 'object') return acc;
        const uid = typeof mention.uid === 'string' ? mention.uid.trim() : '';
        const username = typeof mention.username === 'string' ? mention.username.trim() : '';
        if (!uid || !username) return acc;
        const normalizedUsername = username.toLowerCase();
        if (acc.some((item) => item.uid === uid || item.username === normalizedUsername)) return acc;
        acc.push({
          uid,
          username: normalizedUsername,
          displayName: typeof mention.displayName === 'string' ? mention.displayName : null,
        });
        return acc;
      }, []);

      items.push({
        id: docSnap.id,
        text: typeof data.text === 'string' ? data.text : '',
        uid: data.uid || '',
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Angler',
        photoURL: data.photoURL ?? null,
        createdAt,
        isPro: typeof data.isPro === 'boolean' ? data.isPro : false,
        mentions,
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
  isPro: boolean;
  photoURL?: string | null;
  mentions?: ChatMessageMention[];
}) {
  const normalized = data.text.trim();
  if (!normalized) {
    throw new Error('Message cannot be empty');
  }

  const mentions = Array.isArray(data.mentions)
    ? data.mentions.reduce<ChatMessageMention[]>((acc, mention) => {
      if (!mention || typeof mention !== 'object') return acc;
      const uid = typeof mention.uid === 'string' ? mention.uid.trim() : '';
      const username = typeof mention.username === 'string' ? mention.username.trim().toLowerCase() : '';
      const displayName = typeof mention.displayName === 'string' ? mention.displayName : null;
      if (!uid || !username) return acc;
      if (acc.some((item) => item.uid === uid || item.username === username)) return acc;
      acc.push({ uid, username, displayName });
      return acc;
    }, [])
    : [];

  const messageRef = await addDoc(collection(db, 'chatMessages'), {
    uid: data.uid,
    displayName: data.displayName,
    text: normalized.slice(0, 2000),
    photoURL: data.photoURL ?? null,
    isPro: Boolean(data.isPro),
    createdAt: serverTimestamp(),
    mentions,
  });

  if (mentions.length) {
    const preview = normalized.slice(0, 140);
    const payloads = mentions
      .filter((mention) => mention.uid && mention.uid !== data.uid)
      .map((mention) => ({
        recipientUid: mention.uid,
        actorUid: data.uid,
        actorDisplayName: data.displayName,
        actorPhotoURL: data.photoURL ?? null,
        verb: 'chat_mention' as const,
        resource: { type: 'chatMessage', messageId: messageRef.id } satisfies NotificationResource,
        metadata: {
          preview,
          mentionUsername: mention.username,
        },
      }));

    await Promise.all(payloads.map(async (payload) => {
      try {
        await createNotification(payload);
      } catch (error) {
        console.error('Failed to create chat mention notification', error);
      }
    }));
  }
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

  if (data.senderUid !== data.recipientUid) {
    const senderSnap = await getDoc(doc(db, 'users', data.senderUid));
    const senderData = senderSnap.exists() ? (senderSnap.data() as HookdUser) : null;
    await createNotification({
      recipientUid: data.recipientUid,
      actorUid: data.senderUid,
      actorDisplayName: data.senderDisplayName,
      actorUsername: senderData?.username ?? null,
      actorPhotoURL: data.senderPhotoURL ?? senderData?.photoURL ?? null,
      verb: 'direct_message',
      resource: { type: 'directThread', threadId, otherUid: data.senderUid },
      metadata: {
        threadId,
        preview: normalized.slice(0, 140),
      },
    });
  }
}

/** ---------- Comments ---------- */
export async function addComment(
  catchId: string,
  data: { uid: string; displayName: string; photoURL?: string; text: string },
) {
  const trimmed = data.text.trim();
  if (!trimmed) {
    throw new Error('Comment cannot be empty');
  }

  const commentsCol = collection(db, 'catches', catchId, 'comments');
  const actorSnap = await getDoc(doc(db, 'users', data.uid));
  const actorData = actorSnap.exists() ? (actorSnap.data() as HookdUser) : null;
  const commentRef = await addDoc(commentsCol, {
    uid: data.uid,
    displayName: data.displayName,
    photoURL: data.photoURL ?? actorData?.photoURL ?? null,
    text: trimmed,
    createdAt: serverTimestamp(),
  });

  const postRef = doc(db, 'catches', catchId);
  await updateDoc(postRef, { commentsCount: increment(1) });

  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) {
    return;
  }

  const postData = postSnap.data() as Record<string, any>;
  const ownerUid = typeof postData.uid === 'string' ? postData.uid : null;

  if (ownerUid && ownerUid !== data.uid) {
    await createNotification({
      recipientUid: ownerUid,
      actorUid: data.uid,
      actorDisplayName: data.displayName,
      actorUsername: actorData?.username ?? null,
      actorPhotoURL: data.photoURL ?? actorData?.photoURL ?? null,
      verb: 'comment',
      resource: { type: 'catch', catchId, ownerUid },
      metadata: {
        catchId,
        commentId: commentRef.id,
        preview: trimmed.slice(0, 140),
      },
    });
  }
}

async function removeCommentNotification(ownerUid: string, catchId: string, commentId: string) {
  if (!ownerUid || !catchId || !commentId) {
    return;
  }

  try {
    const notificationsRef = notificationsCollectionFor(ownerUid);
    const snapshot = await getDocs(
      query(
        notificationsRef,
        where('verb', '==', 'comment'),
        where('metadata.commentId', '==', commentId),
      ),
    );

    if (snapshot.empty) {
      return;
    }

    const docs = snapshot.docs.filter((docSnap) => {
      const data = docSnap.data() as NotificationDocData;
      const metadata = data.metadata ?? {};
      return metadata && typeof metadata === 'object' && metadata['catchId'] === catchId;
    });

    if (!docs.length) {
      return;
    }

    let unreadToRemove = 0;
    docs.forEach((docSnap) => {
      const data = docSnap.data() as NotificationDocData;
      if (!data.isRead) {
        unreadToRemove += 1;
      }
    });

    await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', ownerUid);
      const userSnap = await tx.get(userRef);

      if (userSnap.exists() && unreadToRemove > 0) {
        const userData = userSnap.data() as HookdUser;
        const currentUnread = typeof userData.unreadNotificationsCount === 'number'
          ? userData.unreadNotificationsCount
          : 0;
        const nextUnread = Math.max(0, currentUnread - unreadToRemove);
        tx.update(userRef, { unreadNotificationsCount: nextUnread });
      }

      docs.forEach((docSnap) => {
        tx.delete(docSnap.ref);
      });
    });
  } catch (error) {
    console.error('Failed to remove comment notification', error);
  }
}

export async function deleteComment(catchId: string, commentId: string, requesterUid: string) {
  if (!catchId || !commentId || !requesterUid) {
    throw new Error('Missing required parameters to delete a comment.');
  }

  const commentRef = doc(db, 'catches', catchId, 'comments', commentId);
  const catchRef = doc(db, 'catches', catchId);

  let commentAuthorUid: string | null = null;
  let catchOwnerUid: string | null = null;

  await runTransaction(db, async (tx) => {
    const [commentSnap, catchSnap] = await Promise.all([
      tx.get(commentRef),
      tx.get(catchRef),
    ]);

    if (!commentSnap.exists()) {
      throw new Error('Comment not found.');
    }

    if (!catchSnap.exists()) {
      throw new Error('Catch not found.');
    }

    const commentData = commentSnap.data() as Record<string, any>;
    const catchData = catchSnap.data() as Record<string, any>;

    commentAuthorUid = typeof commentData.uid === 'string' ? commentData.uid : null;
    catchOwnerUid = typeof catchData.uid === 'string' ? catchData.uid : null;

    if (requesterUid !== commentAuthorUid && requesterUid !== catchOwnerUid) {
      throw new Error('You do not have permission to delete this comment.');
    }

    tx.delete(commentRef);

    const currentCount = typeof catchData.commentsCount === 'number' ? catchData.commentsCount : 0;
    const nextCount = Math.max(0, currentCount - 1);
    tx.update(catchRef, { commentsCount: nextCount });
  });

  if (catchOwnerUid) {
    await removeCommentNotification(catchOwnerUid, catchId, commentId);
  }
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
  const baseQuery = query(
    collection(db, "catches"),
    where("hashtags", "array-contains", CHALLENGE_HASHTAG),
  );

  try {
    return await fetchChallengeCatchDocs(
      query(baseQuery, orderBy("createdAt", "desc"), limit(CHALLENGE_LIMIT)),
    );
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "failed-precondition") {
      console.warn(
        "Composite index for challenge catches missing. Falling back to client-side sorting.",
        error,
      );
      return fetchChallengeCatchDocs(baseQuery);
    }
    throw error;
  }
}

/** ---------- Tournaments ---------- */
export async function getActiveTournaments(now: Date = new Date()): Promise<Tournament[]> {
  const tournamentsRef = collection(db, TOURNAMENTS_COLLECTION);
  const nowTimestamp = Timestamp.fromDate(now);
  const snap = await getDocs(
    query(
      tournamentsRef,
      where('endAt', '>=', nowTimestamp),
      orderBy('endAt', 'asc')
    )
  );
  const active: Tournament[] = [];

  snap.forEach((docSnap) => {
    const data = mapTournamentData(docSnap.id, docSnap.data() as Record<string, any>);
    if (tournamentIsActive(data, now)) {
      active.push(data);
    }
  });

  return active;
}

export function subscribeToActiveTournaments(
  cb: (tournaments: Tournament[]) => void,
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const nowTimestamp = Timestamp.fromDate(now);
  const tournamentsRef = collection(db, TOURNAMENTS_COLLECTION);
  const q = query(tournamentsRef, where('endAt', '>=', nowTimestamp), orderBy('endAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const tournaments: Tournament[] = [];
    snapshot.forEach((docSnap) => {
      const data = mapTournamentData(docSnap.id, docSnap.data() as Record<string, any>);
      if (tournamentIsActive(data, now)) {
        tournaments.push(data);
      }
    });
    cb(tournaments);
  });
}

export async function postValidatedTournamentEntry(
  payload: ValidatedTournamentEntryPayload,
): Promise<string> {
  const sanitizedVerification: TournamentVerificationSnapshot = {
    exifValidatedAt: payload.verification.exifValidatedAt ?? null,
    poseValidatedAt: payload.verification.poseValidatedAt ?? null,
    hasGps: Boolean(payload.verification.hasGps),
    captureTimestamp: payload.verification.captureTimestamp ?? null,
    sha256: payload.verification.sha256 ?? null,
    missingHashtags: payload.verification.missingHashtags ?? [],
    metadataMismatch: Boolean(payload.verification.metadataMismatch),
    poseSuspicious: Boolean(payload.verification.poseSuspicious),
  };

  const docRef = await addDoc(collection(db, TOURNAMENT_ENTRIES_COLLECTION), {
    tournamentId: payload.tournamentId,
    catchId: payload.catchId,
    userId: payload.userId,
    userDisplayName: payload.userDisplayName ?? null,
    tournamentTitle: payload.tournamentTitle ?? null,
    measurementMode: payload.measurementMode,
    measurementUnit: payload.measurementUnit,
    weightDisplay: payload.weightDisplay ?? null,
    weightScore: payload.weightScore ?? null,
    weightValue: payload.weightValue ?? null,
    lengthDisplay: payload.lengthDisplay ?? null,
    lengthScore: payload.lengthScore ?? null,
    lengthValue: payload.lengthValue ?? null,
    scoreValue: payload.scoreValue,
    scoreLabel: payload.scoreLabel,
    measurementSummary: payload.measurementSummary ?? null,
    verification: sanitizedVerification,
    originalPhotoPath: payload.originalPhotoPath ?? null,
    metadata: payload.metadata ?? null,
    createdAt: serverTimestamp(),
    verifiedAt: serverTimestamp(),
  });

  return docRef.id;
}

export function subscribeToTournamentLeaderboardByWeight(
  limitCount: number,
  cb: (entries: TournamentLeaderboardEntry[]) => void,
) {
  const leaderboardQuery = query(
    collection(db, TOURNAMENT_ENTRIES_COLLECTION),
    orderBy('weightScore', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(leaderboardQuery, (snapshot) => {
    const entries: TournamentLeaderboardEntry[] = [];
    snapshot.forEach((docSnap) => {
      const mapped = mapTournamentEntryData(docSnap.id, docSnap.data() as Record<string, any>);
      if (mapped.weightScore !== null && mapped.weightScore !== undefined) {
        entries.push(mapped);
      }
    });
    cb(entries);
  });
}

export function subscribeToTournamentLeaderboardByLength(
  limitCount: number,
  cb: (entries: TournamentLeaderboardEntry[]) => void,
) {
  const leaderboardQuery = query(
    collection(db, TOURNAMENT_ENTRIES_COLLECTION),
    orderBy('lengthScore', 'desc'),
    limit(limitCount),
  );

  return onSnapshot(leaderboardQuery, (snapshot) => {
    const entries: TournamentLeaderboardEntry[] = [];
    snapshot.forEach((docSnap) => {
      const mapped = mapTournamentEntryData(docSnap.id, docSnap.data() as Record<string, any>);
      if (mapped.lengthScore !== null && mapped.lengthScore !== undefined) {
        entries.push(mapped);
      }
    });
    cb(entries);
  });
}

