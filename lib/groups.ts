import 'server-only';

import { FieldPath, FieldValue, Firestore, FirestoreDataConverter, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminDb } from './firebaseAdmin';

export const GROUP_VISIBILITIES = ['public', 'private'] as const;
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];

export const GROUP_ROLES = ['owner', 'admin', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const GROUP_MEMBERSHIP_STATUSES = ['active', 'invited', 'requested'] as const;
export type GroupMembershipStatus = (typeof GROUP_MEMBERSHIP_STATUSES)[number];

export type GroupRecord = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  visibility: GroupVisibility;
  photoURL: string | null;
  featuredCatchIds: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type GroupMemberRecord = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  status: GroupMembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type GroupEventRecord = {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  createdBy: string;
  startAt: Date;
  endAt: Date | null;
  locationName: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export const groupCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Group name must be at least 3 characters long.')
    .max(120, 'Group name must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  visibility: z
    .enum(GROUP_VISIBILITIES)
    .default('private'),
  photoURL: z
    .string()
    .url('Photo URL must be a valid URL.')
    .optional(),
});

export type GroupCreateInput = z.infer<typeof groupCreateSchema>;

export const groupUpdateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'Group name must be at least 3 characters long.')
      .max(120, 'Group name must be 120 characters or fewer.')
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be 500 characters or fewer.')
      .optional()
      .transform((value) => (value ? value : undefined)),
    visibility: z.enum(GROUP_VISIBILITIES).optional(),
    photoURL: z
      .string()
      .url('Photo URL must be a valid URL.')
      .optional()
      .nullable(),
    featuredCatchIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(
    (value) => {
      const keys: (keyof typeof value)[] = ['name', 'description', 'visibility', 'photoURL', 'featuredCatchIds'];
      return keys.some((key) => Object.prototype.hasOwnProperty.call(value, key));
    },
    { message: 'At least one field must be provided for update.' },
  );

export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;

export const groupEventBaseSchema = z.object({
  groupId: z.string().min(1, 'Group id is required.'),
  title: z
    .string()
    .trim()
    .min(3, 'Event title must be at least 3 characters long.')
    .max(120, 'Event title must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must be 1000 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  startAt: z
    .string()
    .datetime({ offset: true, message: 'Start time must be an ISO timestamp.' }),
  endAt: z
    .string()
    .datetime({ offset: true, message: 'End time must be an ISO timestamp.' })
    .optional(),
  locationName: z
    .string()
    .trim()
    .max(200, 'Location name must be 200 characters or fewer.')
    .optional()
    .transform((value) => (value ? value : undefined)),
  locationLatitude: z
    .number()
    .gte(-90)
    .lte(90)
    .optional(),
  locationLongitude: z
    .number()
    .gte(-180)
    .lte(180)
    .optional(),
});

export const groupEventCreateSchema = groupEventBaseSchema.superRefine((value, ctx) => {
  if (value.endAt) {
    const start = new Date(value.startAt);
    const end = new Date(value.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: 'End time must be after the start time.',
      });
    }
  }

  const hasLatitude = value.locationLatitude != null;
  const hasLongitude = value.locationLongitude != null;
  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['locationLatitude'],
      message: 'Latitude and longitude must both be provided when specifying coordinates.',
    });
  }
});

export type GroupEventCreateInput = z.infer<typeof groupEventCreateSchema>;

export const groupEventUpdateSchema = groupEventBaseSchema
  .partial()
  .extend({ eventId: z.string().min(1) })
  .superRefine((value, ctx) => {
    if (value.startAt && value.endAt) {
      const start = new Date(value.startAt);
      const end = new Date(value.endAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endAt'],
          message: 'End time must be after the start time.',
        });
      }
    }

    const hasLatitude = value.locationLatitude != null;
    const hasLongitude = value.locationLongitude != null;
    if (hasLatitude !== hasLongitude) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationLatitude'],
        message: 'Latitude and longitude must both be provided when specifying coordinates.',
      });
    }
  });

export type GroupEventUpdateInput = z.infer<typeof groupEventUpdateSchema>;

function toTimestamp(value: string): Timestamp {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid timestamp');
  }
  return Timestamp.fromDate(parsed);
}

function membershipDocId(groupId: string, userId: string) {
  return `${groupId}_${userId}`;
}

const groupsConverter: FirestoreDataConverter<GroupRecord> = {
  toFirestore: () => {
    throw new Error('Serialization via converter is not supported.');
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAt;
    const deletedAt = data.deletedAt instanceof Timestamp ? data.deletedAt.toDate() : null;
    return {
      id: snapshot.id,
      name: typeof data.name === 'string' ? data.name : 'Untitled group',
      description: typeof data.description === 'string' ? data.description : null,
      ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
      visibility: GROUP_VISIBILITIES.includes(data.visibility) ? (data.visibility as GroupVisibility) : 'private',
      photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
      featuredCatchIds: Array.isArray(data.featuredCatchIds)
        ? data.featuredCatchIds.filter((value: unknown): value is string => typeof value === 'string')
        : [],
      createdAt,
      updatedAt,
      deletedAt,
    } satisfies GroupRecord;
  },
};

const membersConverter: FirestoreDataConverter<GroupMemberRecord> = {
  toFirestore: () => {
    throw new Error('Serialization via converter is not supported.');
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAt;
    const role = GROUP_ROLES.includes(data.role) ? (data.role as GroupRole) : 'member';
    const status = GROUP_MEMBERSHIP_STATUSES.includes(data.status)
      ? (data.status as GroupMembershipStatus)
      : 'active';
    return {
      id: snapshot.id,
      groupId: typeof data.groupId === 'string' ? data.groupId : '',
      userId: typeof data.userId === 'string' ? data.userId : '',
      role,
      status,
      createdAt,
      updatedAt,
    } satisfies GroupMemberRecord;
  },
};

const eventsConverter: FirestoreDataConverter<GroupEventRecord> = {
  toFirestore: () => {
    throw new Error('Serialization via converter is not supported.');
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : createdAt;
    const startAt = data.startAt instanceof Timestamp ? data.startAt.toDate() : new Date();
    const endAt = data.endAt instanceof Timestamp ? data.endAt.toDate() : null;
    return {
      id: snapshot.id,
      groupId: typeof data.groupId === 'string' ? data.groupId : '',
      title: typeof data.title === 'string' ? data.title : 'Untitled event',
      description: typeof data.description === 'string' ? data.description : null,
      createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
      startAt,
      endAt,
      locationName: typeof data.locationName === 'string' ? data.locationName : null,
      locationLatitude: typeof data.locationLatitude === 'number' ? data.locationLatitude : null,
      locationLongitude: typeof data.locationLongitude === 'number' ? data.locationLongitude : null,
      createdAt,
      updatedAt,
    } satisfies GroupEventRecord;
  },
};

type MembershipCheck = {
  groupId: string;
  userId: string;
  role: GroupRole;
  status: GroupMembershipStatus;
};

export type GroupsRepository = {
  createGroup: (ownerId: string, input: GroupCreateInput) => Promise<GroupRecord>;
  updateGroup: (actorId: string, groupId: string, patch: GroupUpdateInput) => Promise<GroupRecord>;
  deleteGroup: (actorId: string, groupId: string) => Promise<void>;
  getGroup: (actorId: string | null, groupId: string) => Promise<GroupRecord | null>;
  listGroupsForUser: (userId: string) => Promise<GroupRecord[]>;
  listMembers: (actorId: string, groupId: string) => Promise<GroupMemberRecord[]>;
  joinGroup: (userId: string, groupId: string) => Promise<GroupMemberRecord>;
  leaveGroup: (actorId: string, groupId: string, targetUserId?: string) => Promise<void>;
  updateMemberRole: (
    actorId: string,
    groupId: string,
    targetUserId: string,
    role: GroupRole,
  ) => Promise<GroupMemberRecord>;
  createEvent: (actorId: string, input: GroupEventCreateInput) => Promise<GroupEventRecord>;
  updateEvent: (actorId: string, update: GroupEventUpdateInput) => Promise<GroupEventRecord>;
  deleteEvent: (actorId: string, eventId: string) => Promise<void>;
  listEvents: (actorId: string | null, groupId: string, options?: { includePast?: boolean }) => Promise<GroupEventRecord[]>;
  getEvent: (actorId: string, eventId: string) => Promise<GroupEventRecord | null>;
  addCatchToFeed: (actorId: string, groupId: string, catchId: string) => Promise<GroupRecord>;
  removeCatchFromFeed: (actorId: string, groupId: string, catchId: string) => Promise<GroupRecord>;
  getMembership: (groupId: string, userId: string) => Promise<GroupMemberRecord | null>;
};

let repository: GroupsRepository | null = null;

function assertActiveMembership(record: MembershipCheck | null): asserts record is MembershipCheck {
  if (!record || record.status !== 'active') {
    const error = new Error('Forbidden');
    (error as Error & { code?: string }).code = 'forbidden';
    throw error;
  }
}

function ensureRole(actor: MembershipCheck | null, allowed: GroupRole[]): asserts actor is MembershipCheck {
  assertActiveMembership(actor);
  if (!allowed.includes(actor.role)) {
    const error = new Error('Forbidden');
    (error as Error & { code?: string }).code = 'forbidden';
    throw error;
  }
}

async function getGroupMembership(db: Firestore, groupId: string, userId: string): Promise<GroupMemberRecord | null> {
  const doc = await db
    .collection('group_members')
    .doc(membershipDocId(groupId, userId))
    .withConverter(membersConverter)
    .get();
  return doc.exists ? doc.data()! : null;
}

async function listMemberships(db: Firestore, userId: string): Promise<GroupMemberRecord[]> {
  const snapshot = await db
    .collection('group_members')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .withConverter(membersConverter)
    .get();
  return snapshot.docs.map((doc) => doc.data());
}

async function getGroupDoc(db: Firestore, groupId: string): Promise<GroupRecord | null> {
  const snapshot = await db.collection('groups').doc(groupId).withConverter(groupsConverter).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data || data.deletedAt) {
    return null;
  }
  return data;
}

async function createGroupInternal(db: Firestore, ownerId: string, input: GroupCreateInput): Promise<GroupRecord> {
  const ref = db.collection('groups').doc();
  const now = FieldValue.serverTimestamp();
  const payload = {
    name: input.name,
    description: input.description ?? null,
    ownerId,
    visibility: input.visibility,
    photoURL: input.photoURL ?? null,
    featuredCatchIds: [] as string[],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await ref.set(payload);

  const membershipRef = db.collection('group_members').doc(membershipDocId(ref.id, ownerId));
  await membershipRef.set({
    groupId: ref.id,
    userId: ownerId,
    role: 'owner',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  const snapshot = await ref.withConverter(groupsConverter).get();
  return snapshot.data()!;
}

async function updateGroupInternal(
  db: Firestore,
  actorId: string,
  groupId: string,
  patch: GroupUpdateInput,
): Promise<GroupRecord> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }

  const membership = await getGroupMembership(db, groupId, actorId);
  ensureRole(membership, ['owner', 'admin']);

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.name != null) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description ?? null;
  if (patch.visibility != null) updates.visibility = patch.visibility;
  if (patch.photoURL !== undefined) updates.photoURL = patch.photoURL ?? null;
  if (patch.featuredCatchIds) {
    const unique = Array.from(new Set(patch.featuredCatchIds.filter((value) => value.trim())));
    updates.featuredCatchIds = unique.slice(0, 100);
  }

  await db.collection('groups').doc(groupId).update(updates);
  const snapshot = await db.collection('groups').doc(groupId).withConverter(groupsConverter).get();
  return snapshot.data()!;
}

async function deleteGroupInternal(db: Firestore, actorId: string, groupId: string): Promise<void> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }

  const membership = await getGroupMembership(db, groupId, actorId);
  ensureRole(membership, ['owner']);

  await db.collection('groups').doc(groupId).update({ deletedAt: FieldValue.serverTimestamp() });
}

async function getGroupForActor(db: Firestore, actorId: string | null, groupId: string): Promise<GroupRecord | null> {
  const group = await getGroupDoc(db, groupId);
  if (!group) return null;
  if (group.visibility === 'public') {
    return group;
  }
  if (!actorId) return null;
  const membership = await getGroupMembership(db, groupId, actorId);
  if (membership && membership.status === 'active') {
    return group;
  }
  return null;
}

async function listGroupsForUserInternal(db: Firestore, userId: string): Promise<GroupRecord[]> {
  const memberships = await listMemberships(db, userId);
  if (memberships.length === 0) {
    return [];
  }

  const groups: GroupRecord[] = [];
  const chunkSize = 10;
  for (let i = 0; i < memberships.length; i += chunkSize) {
    const chunk = memberships.slice(i, i + chunkSize);
    const ids = chunk.map((entry) => entry.groupId);
    const snapshot = await db
      .collection('groups')
      .where(FieldPath.documentId(), 'in', ids)
      .withConverter(groupsConverter)
      .get();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data && !data.deletedAt) {
        groups.push(data);
      }
    });
  }
  groups.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return groups;
}

async function listMembersInternal(db: Firestore, actorId: string, groupId: string): Promise<GroupMemberRecord[]> {
  const membership = await getGroupMembership(db, groupId, actorId);
  ensureRole(membership, ['owner', 'admin', 'member']);

  const snapshot = await db
    .collection('group_members')
    .where('groupId', '==', groupId)
    .where('status', '==', 'active')
    .withConverter(membersConverter)
    .get();
  return snapshot.docs.map((doc) => doc.data());
}

async function joinGroupInternal(db: Firestore, userId: string, groupId: string): Promise<GroupMemberRecord> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }

  const current = await getGroupMembership(db, groupId, userId);
  if (current && current.status === 'active') {
    return current;
  }

  if (group.visibility === 'private' && (!current || current.status !== 'invited')) {
    const error = new Error('Request to join pending approval');
    (error as Error & { code?: string }).code = 'forbidden';
    throw error;
  }

  const docRef = db.collection('group_members').doc(membershipDocId(groupId, userId));
  const now = FieldValue.serverTimestamp();
  const payload = {
    groupId,
    userId,
    role: current?.role ?? 'member',
    status: 'active',
    createdAt: current ? Timestamp.fromDate(current.createdAt) : now,
    updatedAt: now,
  };

  await docRef.set(payload, { merge: true });
  const snapshot = await docRef.withConverter(membersConverter).get();
  return snapshot.data()!;
}

async function leaveGroupInternal(
  db: Firestore,
  actorId: string,
  groupId: string,
  targetUserId?: string,
): Promise<void> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }

  const target = targetUserId ?? actorId;

  if (group.ownerId === target) {
    const error = new Error('Group owners cannot leave their own group.');
    (error as Error & { code?: string }).code = 'forbidden';
    throw error;
  }

  if (target !== actorId) {
    const actorMembership = await getGroupMembership(db, groupId, actorId);
    ensureRole(actorMembership, ['owner', 'admin']);
  }

  await db.collection('group_members').doc(membershipDocId(groupId, target)).delete();
}

async function updateMemberRoleInternal(
  db: Firestore,
  actorId: string,
  groupId: string,
  targetUserId: string,
  role: GroupRole,
): Promise<GroupMemberRecord> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  const actorMembership = await getGroupMembership(db, groupId, actorId);
  ensureRole(actorMembership, ['owner']);

  const targetMembership = await getGroupMembership(db, groupId, targetUserId);
  assertActiveMembership(targetMembership);

  if (targetMembership.userId === group.ownerId) {
    const error = new Error('Owner role cannot be modified.');
    (error as Error & { code?: string }).code = 'forbidden';
    throw error;
  }

  await db
    .collection('group_members')
    .doc(membershipDocId(groupId, targetUserId))
    .update({ role, updatedAt: FieldValue.serverTimestamp() });

  const snapshot = await db
    .collection('group_members')
    .doc(membershipDocId(groupId, targetUserId))
    .withConverter(membersConverter)
    .get();
  return snapshot.data()!;
}

async function createEventInternal(
  db: Firestore,
  actorId: string,
  input: GroupEventCreateInput,
): Promise<GroupEventRecord> {
  const { groupId } = input;
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  const membership = await getGroupMembership(db, groupId, actorId);
  ensureRole(membership, ['owner', 'admin']);

  const ref = db.collection('events').doc();
  const now = FieldValue.serverTimestamp();
  const payload = {
    groupId,
    title: input.title,
    description: input.description ?? null,
    createdBy: actorId,
    startAt: toTimestamp(input.startAt),
    endAt: input.endAt ? toTimestamp(input.endAt) : null,
    locationName: input.locationName ?? null,
    locationLatitude: input.locationLatitude ?? null,
    locationLongitude: input.locationLongitude ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(payload);
  const snapshot = await ref.withConverter(eventsConverter).get();
  return snapshot.data()!;
}

async function getEventDoc(db: Firestore, eventId: string): Promise<GroupEventRecord | null> {
  const snapshot = await db.collection('events').doc(eventId).withConverter(eventsConverter).get();
  if (!snapshot.exists) {
    return null;
  }
  return snapshot.data() ?? null;
}

async function getEventForActor(db: Firestore, actorId: string, eventId: string): Promise<GroupEventRecord | null> {
  const event = await getEventDoc(db, eventId);
  if (!event) return null;
  const group = await getGroupDoc(db, event.groupId);
  if (!group) return null;
  if (group.visibility === 'public') {
    return event;
  }
  const membership = await getGroupMembership(db, group.id, actorId);
  if (membership && membership.status === 'active') {
    return event;
  }
  return null;
}

async function updateEventInternal(
  db: Firestore,
  actorId: string,
  update: GroupEventUpdateInput,
): Promise<GroupEventRecord> {
  const { eventId } = update;
  const existing = await getEventDoc(db, eventId);
  if (!existing) {
    const error = new Error('Event not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }

  const membership = await getGroupMembership(db, existing.groupId, actorId);
  ensureRole(membership, ['owner', 'admin']);

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (update.title != null) updates.title = update.title;
  if (update.description !== undefined) updates.description = update.description ?? null;
  if (update.startAt) updates.startAt = toTimestamp(update.startAt);
  if (update.endAt !== undefined) updates.endAt = update.endAt ? toTimestamp(update.endAt) : null;
  if (update.locationName !== undefined) updates.locationName = update.locationName ?? null;
  if (update.locationLatitude !== undefined) updates.locationLatitude = update.locationLatitude ?? null;
  if (update.locationLongitude !== undefined) updates.locationLongitude = update.locationLongitude ?? null;

  await db.collection('events').doc(eventId).update(updates);
  const snapshot = await db.collection('events').doc(eventId).withConverter(eventsConverter).get();
  return snapshot.data()!;
}

async function deleteEventInternal(db: Firestore, actorId: string, eventId: string): Promise<void> {
  const existing = await getEventDoc(db, eventId);
  if (!existing) {
    const error = new Error('Event not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  const membership = await getGroupMembership(db, existing.groupId, actorId);
  ensureRole(membership, ['owner', 'admin']);
  await db.collection('events').doc(eventId).delete();
}

async function listEventsInternal(
  db: Firestore,
  actorId: string | null,
  groupId: string,
  options: { includePast?: boolean } = {},
): Promise<GroupEventRecord[]> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  if (group.visibility === 'private') {
    const membership = actorId ? await getGroupMembership(db, groupId, actorId) : null;
    assertActiveMembership(membership);
  }

  const now = Timestamp.fromDate(new Date());
  let base = db.collection('events').where('groupId', '==', groupId);
  if (!options.includePast) {
    base = base.where('startAt', '>=', now);
  }
  const snapshot = await base.orderBy('startAt').withConverter(eventsConverter).get();
  return snapshot.docs.map((doc) => doc.data());
}

async function addCatchToFeedInternal(
  db: Firestore,
  actorId: string,
  groupId: string,
  catchId: string,
): Promise<GroupRecord> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  const membership = await getGroupMembership(db, groupId, actorId);
  ensureRole(membership, ['owner', 'admin']);

  const updated = Array.from(new Set([catchId, ...group.featuredCatchIds])).slice(0, 100);
  await db.collection('groups').doc(groupId).update({
    featuredCatchIds: updated,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snapshot = await db.collection('groups').doc(groupId).withConverter(groupsConverter).get();
  return snapshot.data()!;
}

async function removeCatchFromFeedInternal(
  db: Firestore,
  actorId: string,
  groupId: string,
  catchId: string,
): Promise<GroupRecord> {
  const group = await getGroupDoc(db, groupId);
  if (!group) {
    const error = new Error('Group not found');
    (error as Error & { code?: string }).code = 'not-found';
    throw error;
  }
  const membership = await getGroupMembership(db, groupId, actorId);
  ensureRole(membership, ['owner', 'admin']);

  const updated = group.featuredCatchIds.filter((id) => id !== catchId);
  await db.collection('groups').doc(groupId).update({
    featuredCatchIds: updated,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snapshot = await db.collection('groups').doc(groupId).withConverter(groupsConverter).get();
  return snapshot.data()!;
}

function createFirestoreGroupsRepository(db: Firestore = adminDb): GroupsRepository {
  return {
    createGroup: (ownerId, input) => createGroupInternal(db, ownerId, input),
    updateGroup: (actorId, groupId, patch) => updateGroupInternal(db, actorId, groupId, patch),
    deleteGroup: (actorId, groupId) => deleteGroupInternal(db, actorId, groupId),
    getGroup: (actorId, groupId) => getGroupForActor(db, actorId, groupId),
    listGroupsForUser: (userId) => listGroupsForUserInternal(db, userId),
    listMembers: (actorId, groupId) => listMembersInternal(db, actorId, groupId),
    joinGroup: (userId, groupId) => joinGroupInternal(db, userId, groupId),
    leaveGroup: (actorId, groupId, targetUserId) => leaveGroupInternal(db, actorId, groupId, targetUserId),
    updateMemberRole: (actorId, groupId, targetUserId, role) =>
      updateMemberRoleInternal(db, actorId, groupId, targetUserId, role),
    createEvent: (actorId, input) => createEventInternal(db, actorId, input),
    updateEvent: (actorId, update) => updateEventInternal(db, actorId, update),
    deleteEvent: (actorId, eventId) => deleteEventInternal(db, actorId, eventId),
    listEvents: (actorId, groupId, options) => listEventsInternal(db, actorId, groupId, options),
    getEvent: (actorId, eventId) => getEventForActor(db, actorId, eventId),
    addCatchToFeed: (actorId, groupId, catchId) => addCatchToFeedInternal(db, actorId, groupId, catchId),
    removeCatchFromFeed: (actorId, groupId, catchId) => removeCatchFromFeedInternal(db, actorId, groupId, catchId),
    getMembership: (groupId, userId) => getGroupMembership(db, groupId, userId),
  } satisfies GroupsRepository;
}

export function setGroupsRepositoryForTesting(mock?: GroupsRepository) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test hooks are not available in production.');
  }
  repository = mock ?? createFirestoreGroupsRepository(adminDb);
}

export function getGroupsRepository(): GroupsRepository {
  if (!repository) {
    repository = createFirestoreGroupsRepository(adminDb);
  }
  return repository;
}

export type InMemoryGroupState = {
  groups: Map<string, GroupRecord>;
  members: Map<string, GroupMemberRecord>;
  events: Map<string, GroupEventRecord>;
};

let inMemoryId = 0;

function generateId(prefix: string) {
  inMemoryId += 1;
  return `${prefix}_${inMemoryId.toString(36)}`;
}

export function createInMemoryGroupsRepository(initialState?: Partial<InMemoryGroupState>): GroupsRepository {
  const state: InMemoryGroupState = {
    groups: initialState?.groups ?? new Map(),
    members: initialState?.members ?? new Map(),
    events: initialState?.events ?? new Map(),
  };

  const ensureGroup = (groupId: string) => {
    const group = state.groups.get(groupId) ?? null;
    if (!group) {
      const error = new Error('Group not found');
      (error as Error & { code?: string }).code = 'not-found';
      throw error;
    }
    if (group.deletedAt) {
      const error = new Error('Group not found');
      (error as Error & { code?: string }).code = 'not-found';
      throw error;
    }
    return group;
  };

  const getMembershipRecord = (groupId: string, userId: string): GroupMemberRecord | null => {
    const entry = state.members.get(membershipDocId(groupId, userId));
    return entry ?? null;
  };

  const ensureMembershipRecord = (groupId: string, userId: string): GroupMemberRecord => {
    const record = getMembershipRecord(groupId, userId);
    if (!record) {
      const error = new Error('Forbidden');
      (error as Error & { code?: string }).code = 'forbidden';
      throw error;
    }
    if (record.status !== 'active') {
      const error = new Error('Forbidden');
      (error as Error & { code?: string }).code = 'forbidden';
      throw error;
    }
    return record;
  };

  const repo: GroupsRepository = {
    async createGroup(ownerId, input) {
      const id = generateId('group');
      const now = new Date();
      const record: GroupRecord = {
        id,
        name: input.name,
        description: input.description ?? null,
        ownerId,
        visibility: input.visibility,
        photoURL: input.photoURL ?? null,
        featuredCatchIds: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      state.groups.set(id, record);
      const member: GroupMemberRecord = {
        id: membershipDocId(id, ownerId),
        groupId: id,
        userId: ownerId,
        role: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      state.members.set(member.id, member);
      return record;
    },
    async updateGroup(actorId, groupId, patch) {
      const group = ensureGroup(groupId);
      const membership = ensureMembershipRecord(groupId, actorId);
      if (!['owner', 'admin'].includes(membership.role)) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const updated: GroupRecord = {
        ...group,
        name: patch.name ?? group.name,
        description: patch.description !== undefined ? patch.description ?? null : group.description,
        visibility: patch.visibility ?? group.visibility,
        photoURL: patch.photoURL !== undefined ? patch.photoURL ?? null : group.photoURL,
        featuredCatchIds: patch.featuredCatchIds
          ? Array.from(new Set(patch.featuredCatchIds.filter(Boolean))).slice(0, 100)
          : group.featuredCatchIds,
        updatedAt: new Date(),
      };
      state.groups.set(groupId, updated);
      return updated;
    },
    async deleteGroup(actorId, groupId) {
      const group = ensureGroup(groupId);
      const membership = ensureMembershipRecord(groupId, actorId);
      if (membership.role !== 'owner') {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      state.groups.set(groupId, { ...group, deletedAt: new Date() });
    },
    async getGroup(actorId, groupId) {
      const group = state.groups.get(groupId) ?? null;
      if (!group || group.deletedAt) return null;
      if (group.visibility === 'public') return group;
      if (!actorId) return null;
      const membership = getMembershipRecord(groupId, actorId);
      if (membership && membership.status === 'active') {
        return group;
      }
      return null;
    },
    async listGroupsForUser(userId) {
      const groups: GroupRecord[] = [];
      for (const membership of state.members.values()) {
        if (membership.userId === userId && membership.status === 'active') {
          const group = state.groups.get(membership.groupId);
          if (group && !group.deletedAt) {
            groups.push(group);
          }
        }
      }
      return groups.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async listMembers(actorId, groupId) {
      ensureMembershipRecord(groupId, actorId);
      return Array.from(state.members.values()).filter(
        (member) => member.groupId === groupId && member.status === 'active',
      );
    },
    async joinGroup(userId, groupId) {
      const group = ensureGroup(groupId);
      const existing = state.members.get(membershipDocId(groupId, userId));
      if (existing && existing.status === 'active') {
        return existing;
      }
      if (group.visibility === 'private' && (!existing || existing.status !== 'invited')) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const now = new Date();
      const member: GroupMemberRecord = {
        id: membershipDocId(groupId, userId),
        groupId,
        userId,
        role: existing?.role ?? 'member',
        status: 'active',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      state.members.set(member.id, member);
      return member;
    },
    async leaveGroup(actorId, groupId, targetUserId) {
      const group = ensureGroup(groupId);
      const target = targetUserId ?? actorId;
      if (group.ownerId === target) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      if (target !== actorId) {
        const membership = ensureMembershipRecord(groupId, actorId);
        if (!['owner', 'admin'].includes(membership.role)) {
          const error = new Error('Forbidden');
          (error as Error & { code?: string }).code = 'forbidden';
          throw error;
        }
      }
      state.members.delete(membershipDocId(groupId, target));
    },
    async updateMemberRole(actorId, groupId, targetUserId, role) {
      const group = ensureGroup(groupId);
      const actorMembership = ensureMembershipRecord(groupId, actorId);
      if (actorMembership.role !== 'owner') {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      if (targetUserId === group.ownerId) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const target = ensureMembershipRecord(groupId, targetUserId);
      const updated: GroupMemberRecord = { ...target, role, updatedAt: new Date() };
      state.members.set(updated.id, updated);
      return updated;
    },
    async createEvent(actorId, input) {
      const group = ensureGroup(input.groupId);
      const membership = ensureMembershipRecord(group.id, actorId);
      if (!['owner', 'admin'].includes(membership.role)) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const id = generateId('event');
      const start = new Date(input.startAt);
      const end = input.endAt ? new Date(input.endAt) : null;
      const now = new Date();
      const record: GroupEventRecord = {
        id,
        groupId: input.groupId,
        title: input.title,
        description: input.description ?? null,
        createdBy: actorId,
        startAt: start,
        endAt: end,
        locationName: input.locationName ?? null,
        locationLatitude: input.locationLatitude ?? null,
        locationLongitude: input.locationLongitude ?? null,
        createdAt: now,
        updatedAt: now,
      };
      state.events.set(id, record);
      return record;
    },
    async updateEvent(actorId, update) {
      const event = state.events.get(update.eventId);
      if (!event) {
        const error = new Error('Event not found');
        (error as Error & { code?: string }).code = 'not-found';
        throw error;
      }
      const membership = ensureMembershipRecord(event.groupId, actorId);
      if (!['owner', 'admin'].includes(membership.role)) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const updated: GroupEventRecord = {
        ...event,
        title: update.title ?? event.title,
        description: update.description !== undefined ? update.description ?? null : event.description,
        startAt: update.startAt ? new Date(update.startAt) : event.startAt,
        endAt: update.endAt !== undefined ? (update.endAt ? new Date(update.endAt) : null) : event.endAt,
        locationName: update.locationName !== undefined ? update.locationName ?? null : event.locationName,
        locationLatitude:
          update.locationLatitude !== undefined ? update.locationLatitude ?? null : event.locationLatitude,
        locationLongitude:
          update.locationLongitude !== undefined ? update.locationLongitude ?? null : event.locationLongitude,
        updatedAt: new Date(),
      };
      state.events.set(event.id, updated);
      return updated;
    },
    async deleteEvent(actorId, eventId) {
      const event = state.events.get(eventId);
      if (!event) {
        const error = new Error('Event not found');
        (error as Error & { code?: string }).code = 'not-found';
        throw error;
      }
      const membership = ensureMembershipRecord(event.groupId, actorId);
      if (!['owner', 'admin'].includes(membership.role)) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      state.events.delete(eventId);
    },
    async listEvents(actorId, groupId, options = {}) {
      const group = ensureGroup(groupId);
      if (group.visibility === 'private') {
        ensureMembershipRecord(groupId, actorId ?? '');
      }
      const includePast = Boolean(options.includePast);
      const now = new Date();
      return Array.from(state.events.values())
        .filter((event) => event.groupId === groupId)
        .filter((event) => includePast || event.startAt >= now)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    },
    async getEvent(actorId, eventId) {
      const event = state.events.get(eventId) ?? null;
      if (!event) return null;
      const group = ensureGroup(event.groupId);
      if (group.visibility === 'public') {
        return event;
      }
      ensureMembershipRecord(event.groupId, actorId);
      return event;
    },
    async addCatchToFeed(actorId, groupId, catchId) {
      const group = ensureGroup(groupId);
      const membership = ensureMembershipRecord(groupId, actorId);
      if (!['owner', 'admin'].includes(membership.role)) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const updated = {
        ...group,
        featuredCatchIds: Array.from(new Set([catchId, ...group.featuredCatchIds])).slice(0, 100),
        updatedAt: new Date(),
      } satisfies GroupRecord;
      state.groups.set(groupId, updated);
      return updated;
    },
    async removeCatchFromFeed(actorId, groupId, catchId) {
      const group = ensureGroup(groupId);
      const membership = ensureMembershipRecord(groupId, actorId);
      if (!['owner', 'admin'].includes(membership.role)) {
        const error = new Error('Forbidden');
        (error as Error & { code?: string }).code = 'forbidden';
        throw error;
      }
      const updated = {
        ...group,
        featuredCatchIds: group.featuredCatchIds.filter((id) => id !== catchId),
        updatedAt: new Date(),
      } satisfies GroupRecord;
      state.groups.set(groupId, updated);
      return updated;
    },
    async getMembership(groupId, userId) {
      return getMembershipRecord(groupId, userId);
    },
  };

  return repo;
}
