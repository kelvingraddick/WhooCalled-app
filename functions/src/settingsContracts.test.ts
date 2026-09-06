import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRevenueCatWebhookEvent,
  calendarMonthKey,
  captureCredit,
  releaseCredit,
  monthlyAllowance,
  monthlyRemaining,
  normalizeCreditBalance,
  parseCreditProductMap,
  resetMonthlyUsageForTesting,
  revenueCatProductMap,
  reserveCredit,
} from './settingsContracts';

test('resets the monthly allowance on the first day of a UTC calendar month', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const balance = normalizeCreditBalance(
    {
      monthKey: '2026-08',
      monthlyUsed: 3,
      purchasedCredits: 5,
      subscriptionAllowance: null,
      subscriptionExpiresAt: null,
      planName: null,
    },
    now,
  );

  assert.equal(calendarMonthKey(now), '2026-09');
  assert.equal(monthlyAllowance(balance), 3);
  assert.equal(monthlyRemaining(balance), 3);
  assert.equal(balance.purchasedCredits, 5);
});

test('holds expiring monthly quota before permanent purchased credits', () => {
  const balance = normalizeCreditBalance(
    {
      monthKey: '2026-09',
      monthlyUsed: 2,
      purchasedCredits: 7,
      subscriptionAllowance: 15,
      subscriptionExpiresAt: Date.parse('2026-09-30T00:00:00.000Z'),
      planName: 'Whoo Plus',
    },
    new Date('2026-09-02T00:00:00.000Z'),
  );

  const reservation = reserveCredit(balance);
  assert.ok(reservation);
  assert.equal(reservation.source, 'monthly');
  assert.equal(reservation.balance.monthlyUsed, 2);
  assert.equal(reservation.balance.heldMonthly, 1);
  assert.equal(reservation.balance.purchasedCredits, 7);
});

test('debug reset restores monthly quota without changing holds or purchases', () => {
  const balance = normalizeCreditBalance(
    {
      monthKey: '2026-09',
      monthlyUsed: 12,
      heldMonthly: 2,
      purchasedCredits: 7,
      heldPurchased: 1,
      subscriptionAllowance: 15,
      subscriptionExpiresAt: Date.parse('2026-09-30T00:00:00.000Z'),
      planName: 'Plus',
    },
    new Date('2026-09-02T00:00:00.000Z'),
  );

  const reset = resetMonthlyUsageForTesting(balance);

  assert.equal(reset.monthlyUsed, 0);
  assert.equal(reset.heldMonthly, 2);
  assert.equal(reset.purchasedCredits, 7);
  assert.equal(reset.heldPurchased, 1);
  assert.equal(reset.subscriptionAllowance, 15);
  assert.equal(reset.subscriptionExpiresAt, balance.subscriptionExpiresAt);
  assert.equal(reset.planName, 'Plus');
});

test('captures terminal results and releases total operational failures', () => {
  const balance = normalizeCreditBalance(
    {
      monthKey: '2026-09',
      monthlyUsed: 0,
      heldMonthly: 0,
      purchasedCredits: 0,
      heldPurchased: 0,
    },
    new Date('2026-09-02T00:00:00.000Z'),
  );
  const reservation = reserveCredit(balance);
  assert.ok(reservation);

  const captured = captureCredit(reservation.balance, reservation.source);
  assert.equal(captured.monthlyUsed, 1);
  assert.equal(captured.heldMonthly, 0);

  const retryReservation = reserveCredit(captured);
  assert.ok(retryReservation);
  const released = releaseCredit(
    retryReservation.balance,
    retryReservation.source,
  );
  assert.equal(released.monthlyUsed, 1);
  assert.equal(released.heldMonthly, 0);
});

test('rejects unconfigured RevenueCat product grants', () => {
  assert.throws(() => parseCreditProductMap('{"pack": {}}'));
  assert.deepEqual(parseCreditProductMap('{"pack": {"credits": 10}}'), {
    pack: { credits: 10 },
  });
});

test('defines every production RevenueCat product with its intended quota', () => {
  assert.deepEqual(revenueCatProductMap, {
    'com.wavelinkllc.whoocalled.plus.monthly': {
      monthlyAllowance: 15,
      planName: 'Plus',
    },
    'com.wavelinkllc.whoocalled.plus.annual': {
      monthlyAllowance: 15,
      planName: 'Plus',
    },
    'com.wavelinkllc.whoocalled.pro.monthly': {
      monthlyAllowance: 35,
      planName: 'Pro',
    },
    'com.wavelinkllc.whoocalled.pro.annual': {
      monthlyAllowance: 35,
      planName: 'Pro',
    },
    'com.wavelinkllc.whoocalled.power.monthly': {
      monthlyAllowance: 60,
      planName: 'Power',
    },
    'com.wavelinkllc.whoocalled.power.annual': {
      monthlyAllowance: 60,
      planName: 'Power',
    },
    'com.wavelinkllc.whoocalled.credits.5': { credits: 5 },
    'com.wavelinkllc.whoocalled.credits.20': { credits: 20 },
    'com.wavelinkllc.whoocalled.credits.10': { credits: 10 },
    'com.wavelinkllc.whoocalled.credits.25': { credits: 25 },
    'com.wavelinkllc.whoocalled.credits.50': { credits: 50 },
  });
});

test('applies every paid subscription allowance and preserves its expiry', () => {
  const expiry = Date.parse('2026-10-01T00:00:00.000Z');
  const now = new Date('2026-09-02T00:00:00.000Z');
  const cases = [
    ['com.wavelinkllc.whoocalled.plus.monthly', 15, 'Plus'],
    ['com.wavelinkllc.whoocalled.plus.annual', 15, 'Plus'],
    ['com.wavelinkllc.whoocalled.pro.monthly', 35, 'Pro'],
    ['com.wavelinkllc.whoocalled.pro.annual', 35, 'Pro'],
    ['com.wavelinkllc.whoocalled.power.monthly', 60, 'Power'],
    ['com.wavelinkllc.whoocalled.power.annual', 60, 'Power'],
  ] as const;

  cases.forEach(([productId, allowance, planName]) => {
    const balance = applyRevenueCatWebhookEvent({
      alreadyProcessed: false,
      balance: undefined,
      event: {
        id: `subscription-${planName}`,
        type: 'INITIAL_PURCHASE',
        productId,
        expirationAtMs: expiry,
      },
      productMap: revenueCatProductMap,
      now,
    });

    assert.ok(balance);
    assert.equal(balance.subscriptionAllowance, allowance);
    assert.equal(balance.planName, planName);
    assert.equal(balance.subscriptionExpiresAt, expiry);
  });
});

test('grants current and legacy consumable packs once and does not regrant them on restore', () => {
  const now = new Date('2026-09-02T00:00:00.000Z');
  const cases = [
    ['com.wavelinkllc.whoocalled.credits.5', 5],
    ['com.wavelinkllc.whoocalled.credits.20', 20],
    ['com.wavelinkllc.whoocalled.credits.10', 10],
    ['com.wavelinkllc.whoocalled.credits.25', 25],
    ['com.wavelinkllc.whoocalled.credits.50', 50],
  ] as const;

  cases.forEach(([productId, credits]) => {
    const purchased = applyRevenueCatWebhookEvent({
      alreadyProcessed: false,
      balance: { purchasedCredits: 2 },
      event: {
        id: `pack-purchase-${credits}`,
        type: 'NON_RENEWING_PURCHASE',
        productId,
        expirationAtMs: null,
      },
      productMap: revenueCatProductMap,
      now,
    });
    assert.ok(purchased);
    assert.equal(purchased.purchasedCredits, credits + 2);

    const restored = applyRevenueCatWebhookEvent({
      alreadyProcessed: false,
      balance: purchased,
      event: {
        id: `pack-restore-${credits}`,
        type: 'RESTORE',
        productId,
        expirationAtMs: null,
      },
      productMap: revenueCatProductMap,
      now,
    });
    assert.ok(restored);
    assert.equal(restored.purchasedCredits, credits + 2);
  });
});

test('does not apply a duplicate webhook event', () => {
  const result = applyRevenueCatWebhookEvent({
    alreadyProcessed: true,
    balance: { purchasedCredits: 5 },
    event: {
      id: 'already-processed',
      type: 'INITIAL_PURCHASE',
      productId: 'com.wavelinkllc.whoocalled.credits.5',
      expirationAtMs: null,
    },
    productMap: revenueCatProductMap,
    now: new Date('2026-09-02T00:00:00.000Z'),
  });

  assert.equal(result, null);
});

test('expires and changes subscription plans without touching credits', () => {
  const now = new Date('2026-09-02T00:00:00.000Z');
  const active = {
    purchasedCredits: 9,
    subscriptionAllowance: 15,
    subscriptionExpiresAt: Date.parse('2026-10-01T00:00:00.000Z'),
    planName: 'Plus',
  };
  const upgraded = applyRevenueCatWebhookEvent({
    alreadyProcessed: false,
    balance: active,
    event: {
      id: 'upgrade',
      type: 'PRODUCT_CHANGE',
      productId: 'com.wavelinkllc.whoocalled.power.monthly',
      expirationAtMs: Date.parse('2026-10-01T00:00:00.000Z'),
    },
    productMap: revenueCatProductMap,
    now,
  });
  assert.ok(upgraded);
  assert.equal(upgraded.subscriptionAllowance, 60);
  assert.equal(upgraded.planName, 'Power');
  assert.equal(upgraded.purchasedCredits, 9);

  const expired = applyRevenueCatWebhookEvent({
    alreadyProcessed: false,
    balance: upgraded,
    event: {
      id: 'expiration',
      type: 'EXPIRATION',
      productId: 'com.wavelinkllc.whoocalled.power.monthly',
      expirationAtMs: null,
    },
    productMap: revenueCatProductMap,
    now,
  });
  assert.ok(expired);
  assert.equal(expired.subscriptionAllowance, null);
  assert.equal(expired.subscriptionExpiresAt, null);
  assert.equal(expired.planName, null);
  assert.equal(expired.purchasedCredits, 9);
});
