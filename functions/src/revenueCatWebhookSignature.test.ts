import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { verifyRevenueCatWebhookSignature } from './revenueCatWebhookSignature';

const secret = 'webhook-signing-secret';
const body = Buffer.from('{"event":{"id":"event-1"}}', 'utf8');
const timestamp = 1_788_285_600;
const signature = createHmac('sha256', secret)
  .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]))
  .digest('hex');

test('accepts a current RevenueCat HMAC over the exact raw body', () => {
  assert.equal(
    verifyRevenueCatWebhookSignature({
      header: `t=${timestamp},v1=${signature}`,
      rawBody: body,
      secret,
      now: timestamp * 1000,
    }),
    true,
  );
});

test('rejects invalid signatures and stale deliveries', () => {
  assert.equal(
    verifyRevenueCatWebhookSignature({
      header: `t=${timestamp},v1=bad`,
      rawBody: body,
      secret,
      now: timestamp * 1000,
    }),
    false,
  );
  assert.equal(
    verifyRevenueCatWebhookSignature({
      header: `t=${timestamp},v1=${signature}`,
      rawBody: body,
      secret,
      now: (timestamp + 301) * 1000,
    }),
    false,
  );
});
