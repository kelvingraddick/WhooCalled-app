import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), process.env.ENVFILE ?? '.env');
const values = { ...process.env };

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#')) {
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const required = [
  'REVENUECAT_IOS_API_KEY',
  'REVENUECAT_ANDROID_API_KEY',
  'GUIDELINES_URL',
  'PRIVACY_URL',
  'TERMS_URL',
];
const missing = required.filter(name => !values[name]?.trim());

if (missing.length) {
  throw new Error(`Missing release configuration: ${missing.join(', ')}`);
}

for (const name of ['GUIDELINES_URL', 'PRIVACY_URL', 'TERMS_URL']) {
  const url = new URL(values[name]);
  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use an https URL.`);
  }
}

console.log('Public release configuration is complete.');
