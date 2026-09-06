import { createHmac, timingSafeEqual } from 'node:crypto';

const signatureToleranceSeconds = 5 * 60;

export function verifyRevenueCatWebhookSignature({
  header,
  rawBody,
  secret,
  now = Date.now(),
}: {
  header: string | undefined;
  rawBody: Buffer | undefined;
  secret: string;
  now?: number;
}): boolean {
  if (!header || !rawBody || !secret) {
    return false;
  }

  const parts = Object.fromEntries(
    header.split(',').map(part => {
      const separator = part.indexOf('=');
      return [
        part.slice(0, separator).trim(),
        part.slice(separator + 1).trim(),
      ];
    }),
  );
  const timestamp = parts.t;
  const receivedSignature = parts.v1;
  const timestampSeconds = Number(timestamp);

  if (
    !timestamp ||
    !receivedSignature ||
    !Number.isFinite(timestampSeconds) ||
    Math.abs(now / 1000 - timestampSeconds) > signatureToleranceSeconds
  ) {
    return false;
  }

  const signedPayload = Buffer.concat([
    Buffer.from(`${timestamp}.`, 'utf8'),
    rawBody,
  ]);
  const expectedSignature = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  const expected = Buffer.from(expectedSignature, 'utf8');
  const received = Buffer.from(receivedSignature, 'utf8');

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
