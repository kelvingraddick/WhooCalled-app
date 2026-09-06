import assert from 'node:assert/strict';
import test from 'node:test';

import { sourceOrigin } from './sourceMetadata';

test('classifies a matching web domain as first-party', () => {
  assert.equal(
    sourceOrigin('www.johnsonhvac.com', 'Johnson HVAC', 'WEB'),
    'FIRST_PARTY',
  );
  assert.equal(
    sourceOrigin('directory.example', 'Johnson HVAC', 'DIRECTORY'),
    'INDEPENDENT',
  );
});
