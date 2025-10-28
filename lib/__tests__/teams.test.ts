import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addPendingInviteToTeamArrays,
  applyAcceptedMemberToTeamArrays,
  ensureProAccess,
  normalizeTeamName,
} from "../firestore";

const PRO_USER = { uid: "pro", isPro: true } as const;
const FREE_USER = { uid: "free", isPro: false } as const;

describe("normalizeTeamName", () => {
  it("trims whitespace and enforces minimum length", () => {
    assert.equal(normalizeTeamName("  Hook'd Legends  "), "Hook'd Legends");
  });

  it("throws when the value is missing or too short", () => {
    assert.throws(() => normalizeTeamName(""));
    assert.throws(() => normalizeTeamName("go"));
  });
});

describe("ensureProAccess", () => {
  it("allows pro members", () => {
    assert.doesNotThrow(() => ensureProAccess(PRO_USER));
  });

  it("blocks free users", () => {
    assert.throws(() => ensureProAccess(FREE_USER));
    assert.throws(() => ensureProAccess(null));
  });
});

describe("team invite helpers", () => {
  it("adds invitees without duplicates", () => {
    const pending = addPendingInviteToTeamArrays({ pendingInviteUids: ["one"] }, "two");
    assert.deepEqual(pending.sort(), ["one", "two"]);

    const duplicate = addPendingInviteToTeamArrays({ pendingInviteUids: pending }, "one");
    assert.deepEqual(duplicate.sort(), ["one", "two"]);
  });

  it("moves invitees into the member list when accepted", () => {
    const initial = {
      memberUids: ["captain"],
      pendingInviteUids: ["angler"],
    };

    const result = applyAcceptedMemberToTeamArrays(initial, "angler");
    assert.deepEqual(result.memberUids.sort(), ["angler", "captain"]);
    assert.deepEqual(result.pendingInviteUids, []);
    assert.equal(result.memberCount, 2);
  });

  it("supports an end-to-end invite acceptance flow", () => {
    const teamState = { memberUids: ["captain"], pendingInviteUids: [] };
    const pending = addPendingInviteToTeamArrays(teamState, "angler");

    const accepted = applyAcceptedMemberToTeamArrays(
      { ...teamState, pendingInviteUids: pending },
      "angler",
    );

    assert.deepEqual(accepted.memberUids.sort(), ["angler", "captain"]);
    assert.deepEqual(accepted.pendingInviteUids, []);
    assert.equal(accepted.memberCount, 2);
  });
});
