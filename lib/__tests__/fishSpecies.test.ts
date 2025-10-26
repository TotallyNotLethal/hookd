import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterFishSpecies,
  findFishSpeciesByName,
  normalizeFishName,
} from '../fishSpecies';

describe('fishSpecies filtering', () => {
  it('returns all species when query is empty', () => {
    const result = filterFishSpecies('');
    assert.ok(result.length > 20, 'expected a sizeable species catalog');
  });

  it('matches species by common name', () => {
    const result = filterFishSpecies('largemouth');
    assert.ok(result.some((species) => species.id === 'largemouth-bass'));
  });

  it('matches species by alias tokens', () => {
    const result = filterFishSpecies('king salmon');
    assert.ok(result.some((species) => species.id === 'chinook-salmon'));
  });

  it('ignores accents and casing when matching', () => {
    const result = filterFishSpecies('dORadó');
    assert.ok(result.some((species) => species.id === 'mahi-mahi'));
  });

  it('normalizes names consistently', () => {
    assert.equal(normalizeFishName('Átlantic Salmon'), 'atlantic salmon');
  });

  it('finds species by any alias', () => {
    const species = findFishSpeciesByName('bucketmouth');
    assert.equal(species?.id, 'largemouth-bass');
  });
});
