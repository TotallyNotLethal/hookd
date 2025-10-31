import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createInMemoryGroupsRepository,
  groupCreateSchema,
  groupEventCreateSchema,
  groupEventUpdateSchema,
} from '../groups';

describe('groups repository (in-memory)', () => {
  it('creates a group and owner membership', async () => {
    const repo = createInMemoryGroupsRepository();
    const input = groupCreateSchema.parse({ name: 'River crew', visibility: 'public' });
    const group = await repo.createGroup('owner', input);
    assert.equal(group.name, 'River crew');
    const membership = await repo.getMembership(group.id, 'owner');
    assert.ok(membership);
    assert.equal(membership?.role, 'owner');
    assert.equal(membership?.status, 'active');
  });

  it('prevents joining private groups without invite', async () => {
    const repo = createInMemoryGroupsRepository();
    const privateGroup = await repo.createGroup('captain', groupCreateSchema.parse({ name: 'Secret spot', visibility: 'private' }));
    await assert.rejects(() => repo.joinGroup('angler', privateGroup.id));
  });

  it('allows owner to manage feed entries', async () => {
    const repo = createInMemoryGroupsRepository();
    const group = await repo.createGroup('leader', groupCreateSchema.parse({ name: 'Topwater squad', visibility: 'public' }));
    assert.deepEqual(group.featuredCatchIds, []);
    const updated = await repo.addCatchToFeed('leader', group.id, 'catch-1');
    assert.deepEqual(updated.featuredCatchIds, ['catch-1']);
    const trimmed = await repo.removeCatchFromFeed('leader', group.id, 'catch-1');
    assert.deepEqual(trimmed.featuredCatchIds, []);
  });

  it('enforces permission boundaries for feed management', async () => {
    const repo = createInMemoryGroupsRepository();
    const group = await repo.createGroup('captain', groupCreateSchema.parse({ name: 'Traveling anglers', visibility: 'public' }));
    await repo.joinGroup('member', group.id);
    await assert.rejects(() => repo.addCatchToFeed('member', group.id, 'catch-x'));
  });

  it('supports full event lifecycle with admin permissions', async () => {
    const repo = createInMemoryGroupsRepository();
    const group = await repo.createGroup('captain', groupCreateSchema.parse({ name: 'Tournament squad', visibility: 'public' }));
    await repo.joinGroup('co-captain', group.id);
    await repo.updateMemberRole('captain', group.id, 'co-captain', 'admin');

    const eventInput = groupEventCreateSchema.parse({
      groupId: group.id,
      title: 'Launch at dawn',
      startAt: new Date().toISOString(),
      description: 'Bring coffee.',
    });
    const created = await repo.createEvent('co-captain', eventInput);
    assert.equal(created.title, 'Launch at dawn');

    const update = groupEventUpdateSchema.parse({
      eventId: created.id,
      title: 'Launch at sunrise',
      groupId: group.id,
    });
    const updated = await repo.updateEvent('co-captain', update);
    assert.equal(updated.title, 'Launch at sunrise');

    const events = await repo.listEvents('captain', group.id, { includePast: true });
    assert.equal(events.length, 1);

    await repo.deleteEvent('co-captain', created.id);
    const after = await repo.listEvents('captain', group.id, { includePast: true });
    assert.equal(after.length, 0);
  });

  it('blocks non-admins from event management', async () => {
    const repo = createInMemoryGroupsRepository();
    const group = await repo.createGroup('captain', groupCreateSchema.parse({ name: 'Weekend crew', visibility: 'public' }));
    await repo.joinGroup('angler', group.id);
    await assert.rejects(() =>
      repo.createEvent(
        'angler',
        groupEventCreateSchema.parse({ groupId: group.id, title: 'Trip', startAt: new Date().toISOString() }),
      ),
    );
  });
});
