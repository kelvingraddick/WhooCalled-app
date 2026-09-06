import assert from 'node:assert/strict';
import test from 'node:test';

import type { GenerateContentResponse } from '@google/genai';

import {
  evidenceFromGoogleResponse,
  lookupGoogleGroundedEvidence,
  shouldUseBraveSearchFallback,
  type GroundingRequest,
} from './googleGrounding';
import { providerFailureSummary } from './lookupProviders';

const publicDns = async () => ['93.184.216.34'];

function responseWith(
  chunks: ReadonlyArray<Readonly<{ title: string; uri: string }>>,
  renderedContent = '<style>.g{color:#4285f4}</style><a href="https://google.com/search?q=4045551212">Search</a>',
): GenerateContentResponse {
  return {
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: chunks.map(chunk => ({ web: chunk })),
          searchEntryPoint: { renderedContent },
          webSearchQueries: ['404-555-1212 spam'],
        },
      },
    ],
  } as GenerateContentResponse;
}

const spamRequest: GroundingRequest = {
  e164: '+14045551212',
  candidateName: null,
  model: 'gemini-3.5-flash-lite',
  projectId: 'whoo-called',
  stage: 'reputation',
};

test('Google grounding verifies exact-number spam pages and follows safe redirects', async () => {
  const requested: string[] = [];
  const result = await evidenceFromGoogleResponse(
    responseWith([
      { title: 'Grounded redirect', uri: 'https://vertex.example/redirect' },
      { title: 'Wrong number', uri: 'https://wrong.example/report' },
      { title: 'Unsafe', uri: 'https://127.0.0.1/report' },
    ]),
    spamRequest,
    {
      resolveHost: publicDns,
      fetchImpl: async input => {
        const url = String(input);
        requested.push(url);
        if (url.includes('vertex.example')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://reports.example/404-555-1212' },
          });
        }
        if (url.includes('wrong.example')) {
          return new Response(
            '<html><title>Wrong</title><body>Spam report for 404-555-9999</body></html>',
            { headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response(
          '<html><title>404-555-1212 report</title><body>Users reported (404) 555-1212 as an unwanted robocall.</body></html>',
          { headers: { 'content-type': 'text/html' } },
        );
      },
    },
  );

  assert.equal(requested.length, 3);
  assert.deepEqual(result.evidence, [
    {
      title: '404-555-1212 report',
      description:
        '404-555-1212 report Users reported (404) 555-1212 as an unwanted robocall.',
      domain: 'reports.example',
      url: 'https://reports.example/404-555-1212',
      retrievalProvider: 'GOOGLE_GROUNDING',
    },
  ]);
  assert.equal(result.attribution?.stage, 'reputation');
  assert.equal(result.diagnostics.groundedCitationCount, 3);
  assert.equal(result.diagnostics.verifiedCount, 1);
  assert.equal(result.diagnostics.rejected.content_mismatch, 1);
  assert.equal(result.diagnostics.rejected.unsafe_url, 1);
});

test('duplicate citations are fetched once and counted once', async () => {
  let fetchCount = 0;
  const result = await evidenceFromGoogleResponse(
    responseWith([
      { title: 'First', uri: 'https://reports.example/404-555-1212' },
      { title: 'Duplicate', uri: 'https://reports.example/404-555-1212' },
    ]),
    spamRequest,
    {
      resolveHost: publicDns,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response('Spam report for 404-555-1212.', {
          headers: { 'content-type': 'text/plain' },
        });
      },
    },
  );

  assert.equal(fetchCount, 1);
  assert.equal(result.diagnostics.groundedCitationCount, 1);
  assert.equal(result.evidence.length, 1);
});

test('production citation fetches connect through a validated address', async () => {
  let receivedUrl = '';
  let receivedAddresses: string[] = [];
  const result = await evidenceFromGoogleResponse(
    responseWith([{ title: 'Report', uri: 'https://reports.example/report' }]),
    spamRequest,
    {
      resolveHost: async () => ['93.184.216.34'],
      fetchAtValidatedAddress: async (url, addresses) => {
        receivedUrl = url.toString();
        receivedAddresses = addresses;
        return new Response('Spam report for 404-555-1212.', {
          headers: { 'content-type': 'text/plain' },
        });
      },
    },
  );

  assert.equal(receivedUrl, 'https://reports.example/report');
  assert.deepEqual(receivedAddresses, ['93.184.216.34']);
  assert.equal(result.evidence.length, 1);
});

test('identity evidence requires the candidate near the exact number', async () => {
  const filler = 'x'.repeat(1_100);
  const result = await evidenceFromGoogleResponse(
    responseWith([
      { title: 'Near', uri: 'https://near.example/contact' },
      { title: 'Far', uri: 'https://far.example/contact' },
    ]),
    { ...spamRequest, candidateName: 'Johnson HVAC', stage: 'web' },
    {
      resolveHost: publicDns,
      fetchImpl: async input =>
        new Response(
          String(input).includes('near.example')
            ? '<title>Johnson HVAC</title>Johnson HVAC can be reached at 404-555-1212.'
            : `<title>Directory</title>Johnson HVAC ${filler} 404-555-1212`,
          { headers: { 'content-type': 'text/html' } },
        ),
    },
  );

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].domain, 'near.example');
  assert.equal(result.diagnostics.rejected.content_mismatch, 1);
});

test('grounded citations without required Search attribution are rejected', async () => {
  await assert.rejects(
    () =>
      evidenceFromGoogleResponse(
        responseWith(
          [{ title: 'Report', uri: 'https://reports.example/report' }],
          '',
        ),
        spamRequest,
        { resolveHost: publicDns },
      ),
    error => {
      assert.deepEqual(providerFailureSummary(error), {
        failureKind: 'invalid_response',
        httpStatus: null,
      });
      return true;
    },
  );
});

test('oversized and non-text pages are dropped without failing the search', async () => {
  const oversized = 'x'.repeat(1024 * 1024 + 1);
  const result = await evidenceFromGoogleResponse(
    responseWith([
      { title: 'Large', uri: 'https://large.example/report' },
      { title: 'Image', uri: 'https://image.example/report' },
    ]),
    spamRequest,
    {
      resolveHost: publicDns,
      fetchImpl: async input =>
        String(input).includes('large.example')
          ? new Response(oversized, {
              headers: { 'content-type': 'text/html' },
            })
          : new Response('image', { headers: { 'content-type': 'image/png' } }),
    },
  );

  assert.deepEqual(result.evidence, []);
  assert.equal(result.diagnostics.rejected.too_large, 1);
  assert.equal(result.diagnostics.rejected.non_text, 1);
});

test('page timeouts are dropped without failing the grounded response', async () => {
  const result = await evidenceFromGoogleResponse(
    responseWith([{ title: 'Timeout', uri: 'https://timeout.example/report' }]),
    spamRequest,
    {
      resolveHost: publicDns,
      fetchImpl: async () => {
        throw new DOMException('aborted', 'AbortError');
      },
    },
  );

  assert.deepEqual(result.evidence, []);
  assert.equal(result.diagnostics.rejected.timeout, 1);
});

test('grounding request uses the selected model and exact-number prompt', async () => {
  let prompt = '';
  let model = '';
  const result = await lookupGoogleGroundedEvidence(
    { ...spamRequest, candidateName: 'Johnson HVAC', stage: 'web' },
    {
      generateContent: async (nextPrompt, nextModel) => {
        prompt = nextPrompt;
        model = nextModel;
        return responseWith([]);
      },
    },
  );

  assert.equal(model, 'gemini-3.5-flash-lite');
  assert.match(prompt, /\(404\) 555-1212/);
  assert.match(prompt, /Johnson HVAC/);
  assert.deepEqual(result.evidence, []);
});

test('Google provider failures expose safe operational diagnostics', async () => {
  await assert.rejects(
    () =>
      lookupGoogleGroundedEvidence(spamRequest, {
        generateContent: async () => {
          throw { status: 429, message: 'rate limited' };
        },
      }),
    error => {
      assert.deepEqual(providerFailureSummary(error), {
        failureKind: 'http_error',
        httpStatus: 429,
      });
      return true;
    },
  );
});

test('Brave fallback remains disabled unless Google failed and the flag is enabled', () => {
  assert.equal(shouldUseBraveSearchFallback(false, true), false);
  assert.equal(shouldUseBraveSearchFallback(true, false), false);
  assert.equal(shouldUseBraveSearchFallback(true, true), true);
});
