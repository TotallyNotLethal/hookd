import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  REGULATIONS_DATASET_VERSION,
  describeLicense,
  getRegulationSummary,
  inferRegionFromLocation,
  queryRegulations,
} from '@/lib/regulationsStore';

test('regulation store resolves species rules by alias', () => {
  const record = getRegulationSummary({ region: 'Minnesota', species: 'Walleyes' });
  assert.ok(record, 'should resolve regulation record');
  assert.equal(record?.region.key, 'us-mn');
  assert.equal(record?.species.key, 'walleye');
  assert.match(record?.summary ?? '', /Lake of the Woods/);
});

test('regulation query falls back to region defaults', () => {
  const records = queryRegulations({ region: 'US-OH' });
  assert.ok(Array.isArray(records));
  assert.ok(records.length >= 1, 'at least one record returned for Ohio');
  assert.equal(records[0]?.region.key, 'us-oh');
});

test('region inference works for formatted locations', () => {
  const region = inferRegionFromLocation('Cleveland, OH');
  assert.equal(region, 'us-oh');
});

test('license descriptions provide renewal context', () => {
  const license = describeLicense('Texas');
  assert.ok(license);
  assert.ok(license?.summary.includes('Texas'));
  assert.ok(license?.defaultReminderLeadDays > 0);
});

test('dataset version tag is stable', () => {
  assert.match(REGULATIONS_DATASET_VERSION, /^2024/);
});
