import assert from 'node:assert/strict';
import test from 'node:test';

import {
  lookupBraveEvidence,
  lookupBraveSpamEvidence,
  lookupTrestle,
  lookupTwilio,
  providerFailureSummary,
} from './lookupProviders';

test('provider adapters persist only display-safe normalized claims', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    calls.push(url);

    if (url.includes('lookups.twilio.com')) {
      return new Response(
        JSON.stringify({
          valid: true,
          national_format: '(404) 555-1212',
          line_type_intelligence: { carrier_name: 'Verizon', type: 'mobile' },
          caller_name: { caller_name: 'Johnson HVAC' },
          private_provider_payload: { never: 'persisted' },
        }),
      );
    }
    if (url.includes('api.trestleiq.com')) {
      return new Response(
        JSON.stringify({
          owners: [
            {
              name: 'Johnson HVAC',
              type: 'BUSINESS',
              current_address: { state_code: 'GA' },
              raw_contact_data: 'not returned',
            },
          ],
        }),
      );
    }
    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: 'Johnson HVAC contact',
              description: 'Call (404) 555-1212 today.',
              url: 'https://johnsonhvac.example/contact',
            },
            {
              title: 'Unsafe source',
              description: 'Call (404) 555-1212 today.',
              url: 'http://unsafe.example/contact',
            },
            {
              title: 'No exact corroboration',
              description: 'No number on this page.',
              url: 'https://irrelevant.example/contact',
            },
          ],
        },
      }),
    );
  };

  try {
    const validation = await lookupTwilio('+14045551212', 'sid', 'token');
    const owners = await lookupTrestle('+14045551212', 'trestle-key');
    const evidence = await lookupBraveEvidence(
      '+14045551212',
      'Johnson HVAC',
      'brave-key',
    );

    assert.deepEqual(validation, {
      valid: true,
      phoneDisplay: '(404) 555-1212',
      carrier: 'Verizon',
      lineType: 'mobile',
      callerName: 'Johnson HVAC',
    });
    assert.deepEqual(owners, [
      { name: 'Johnson HVAC', kind: 'BUSINESS', region: 'GA' },
    ]);
    assert.deepEqual(evidence, [
      {
        title: 'Johnson HVAC contact',
        description: 'Call (404) 555-1212 today.',
        domain: 'johnsonhvac.example',
        url: 'https://johnsonhvac.example/contact',
        retrievalProvider: 'BRAVE',
      },
    ]);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider failures remain retryable errors for the task queue', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });

  try {
    await assert.rejects(
      () => lookupTwilio('+14045551212', 'sid', 'token'),
      error => {
        assert.deepEqual(providerFailureSummary(error), {
          failureKind: 'http_error',
          httpStatus: 503,
        });
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Brave spam evidence requires exact-number, keyword, and HTTPS matches', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async input => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              title: 'Spam reports for 404-555-1212',
              description: 'Several users called this a robocall.',
              url: 'https://reports.example/404-555-1212#comments',
            },
            {
              title: 'Duplicate',
              description: 'Scam reports for 404-555-1212.',
              url: 'https://reports.example/404-555-1212',
            },
            {
              title: 'Unsafe spam result',
              description: 'Spam reports for 404-555-1212.',
              url: 'http://unsafe.example/404-555-1212',
            },
            {
              title: 'No exact number',
              description: 'Spam reports for another caller.',
              url: 'https://missing.example/report',
            },
            {
              title: 'Exact number',
              description: 'Caller details.',
              extra_snippets: ['This is a telemarketer using 404-555-1212.'],
              url: 'https://snippets.example/report',
            },
          ],
        },
      }),
    );
  };

  try {
    const evidence = await lookupBraveSpamEvidence('+14045551212', 'brave-key');
    const search = new URL(requestedUrl);
    assert.equal(search.searchParams.get('q'), '"4045551212"');
    assert.equal(search.searchParams.get('extra_snippets'), 'true');
    assert.equal(search.searchParams.get('count'), '20');
    assert.deepEqual(evidence, [
      {
        title: 'Spam reports for 404-555-1212',
        description: 'Several users called this a robocall.',
        domain: 'reports.example',
        url: 'https://reports.example/404-555-1212',
        retrievalProvider: 'BRAVE',
      },
      {
        title: 'Exact number',
        description: 'Caller details.',
        domain: 'snippets.example',
        url: 'https://snippets.example/report',
        retrievalProvider: 'BRAVE',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
