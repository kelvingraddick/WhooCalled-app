import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const projectId = 'whoo-called';
const androidAppId = '1:1046838355041:android:68a1dff8c7dd69634af620';
const iosAppId = '1:1046838355041:ios:81c741307394d3d04af620';

const androidApiKey = process.env.WHOO_CALLED_ANDROID_API_KEY;
const iosApiKey = process.env.WHOO_CALLED_IOS_API_KEY;

if (!androidApiKey || !iosApiKey) {
  throw new Error(
    'Set WHOO_CALLED_ANDROID_API_KEY and WHOO_CALLED_IOS_API_KEY before refreshing Firebase configuration.',
  );
}

function sdkConfig(platform, appId) {
  return execFileSync(
    'npx',
    [
      'firebase',
      'apps:sdkconfig',
      platform,
      appId,
      '--project',
      projectId,
      '--non-interactive',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

const androidConfig = JSON.parse(sdkConfig('ANDROID', androidAppId));
const androidClient = androidConfig.client?.find(
  client =>
    client.client_info?.android_client_info?.package_name ===
    'com.wavelinkllc.whoocalled',
);
if (!androidClient?.api_key?.[0]) {
  throw new Error('The Android Firebase SDK configuration is missing its API key.');
}
androidClient.api_key[0].current_key = androidApiKey;
writeFileSync(
  'android/app/google-services.json',
  `${JSON.stringify(androidConfig, null, 2)}\n`,
  { mode: 0o600 },
);

const iosConfig = sdkConfig('IOS', iosAppId);
const updatedIosConfig = iosConfig.replace(
  /(<key>API_KEY<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${iosApiKey}$2`,
);
if (updatedIosConfig === iosConfig) {
  throw new Error('The iOS Firebase SDK configuration is missing its API key.');
}
writeFileSync('ios/WhooCalled/GoogleService-Info.plist', updatedIosConfig, {
  mode: 0o600,
});
