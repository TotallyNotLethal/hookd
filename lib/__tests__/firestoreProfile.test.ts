import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIL_ANGLER_BADGE,
  LIL_ANGLER_MAX_AGE,
  MAX_PROFILE_AGE,
  MIN_PROFILE_AGE,
  normalizeUserAge,
  sanitizeUserBadges,
  syncBadgesForAge,
} from "../firestore";

describe("normalizeUserAge", () => {
  it("returns null for empty or invalid inputs", () => {
    assert.equal(normalizeUserAge(undefined), null);
    assert.equal(normalizeUserAge(null), null);
    assert.equal(normalizeUserAge(""), null);
    assert.equal(normalizeUserAge("abc"), null);
    assert.equal(normalizeUserAge({}), null);
  });

  it("clamps values within configured bounds", () => {
    assert.equal(normalizeUserAge(-5), MIN_PROFILE_AGE);
    assert.equal(normalizeUserAge(999), MAX_PROFILE_AGE);
  });

  it("rounds fractional values to the nearest whole number", () => {
    assert.equal(normalizeUserAge(4.4), 4);
    assert.equal(normalizeUserAge("7.6"), 8);
  });
});

describe("syncBadgesForAge", () => {
  it("adds the Lil Angler badge when the age is under the threshold", () => {
    const result = syncBadgesForAge([], LIL_ANGLER_MAX_AGE);
    assert.ok(result.includes(LIL_ANGLER_BADGE));
  });

  it("removes the Lil Angler badge when the age exceeds the threshold", () => {
    const result = syncBadgesForAge([LIL_ANGLER_BADGE], LIL_ANGLER_MAX_AGE + 1);
    assert.ok(!result.includes(LIL_ANGLER_BADGE));
  });

  it("prevents duplicate entries and preserves other badges", () => {
    const initial = ["pro", LIL_ANGLER_BADGE, "veteran", LIL_ANGLER_BADGE];
    const sanitized = sanitizeUserBadges(initial);
    const result = syncBadgesForAge(sanitized, 8);

    assert.equal(result.filter((badge) => badge === LIL_ANGLER_BADGE).length, 1);
    assert.deepEqual(result, ["pro", LIL_ANGLER_BADGE, "veteran"]);
  });

  it("removes the Lil Angler badge when age is unspecified", () => {
    const result = syncBadgesForAge([LIL_ANGLER_BADGE, "pro"], null);
    assert.deepEqual(result, ["pro"]);
  });
});
