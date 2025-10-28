import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  USERNAME_MIN_LENGTH,
  validateAndNormalizeUsername,
} from "../username";

describe("validateAndNormalizeUsername", () => {
  it("lowercases valid usernames", () => {
    assert.equal(validateAndNormalizeUsername("Test_User123"), "test_user123");
  });

  it("trims whitespace around usernames", () => {
    assert.equal(validateAndNormalizeUsername("  fisher_man  "), "fisher_man");
  });

  it("rejects usernames shorter than the minimum length", () => {
    assert.throws(
      () => validateAndNormalizeUsername("ab"),
      new RegExp(`at least ${USERNAME_MIN_LENGTH} characters`, "i"),
    );
  });

  it("rejects usernames with spaces", () => {
    assert.throws(
      () => validateAndNormalizeUsername("fish master"),
      /letters, numbers, and underscores/i,
    );
  });

  it("rejects punctuation", () => {
    assert.throws(
      () => validateAndNormalizeUsername("angler!"),
      /letters, numbers, and underscores/i,
    );
  });
});
