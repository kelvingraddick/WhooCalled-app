# Whoo Called

Whoo Called is a React Native reverse phone-lookup app for iOS and Android.

## Local setup

Use Node 22.23.2:

    nvm use
    npm install
    cd ios && bundle install && bundle exec pod install

Firebase mobile configuration is intentionally untracked. Before building a
native app, download fresh iOS and Android configuration files for
`whoo-called` from Firebase, then place them at
`ios/WhooCalled/GoogleService-Info.plist` and
`android/app/google-services.json`. Never commit those files or their client
API keys.

After rotating the platform keys, regenerate the ignored local files without
printing key values:

    WHOO_CALLED_ANDROID_API_KEY=... WHOO_CALLED_IOS_API_KEY=... node scripts/refresh-mobile-firebase-configs.mjs

Keep code signing enabled for Simulator builds that exercise sign-in:

    xcodebuild -workspace ios/WhooCalled.xcworkspace -scheme WhooCalled -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build CODE_SIGNING_ALLOWED=YES

Run this command from the repository root. Disabling signing omits the
Simulator's compiled application/keychain entitlements. Google sign-in then
fails with keychain error `-2`, while Simulator security logs report `-34018`
(missing application-identifier or keychain-access-groups). A keychain reset
does not repair missing entitlements; rebuild with signing enabled and install
the resulting app.

The app target's `Verify Simulator signing` build phase rejects Simulator
builds with signing disabled so this authentication failure cannot silently
return after a rebuild.

Run the secure Firebase foundation locally:

    npm run emulators
    npm run functions:build
    npm run test:rules

The default Firebase project is whoo-called. Shared phone intelligence,
credits, provider runs, billing events, and moderation data are server-only.
Clients can read only their own lookup history.

Analytics is disabled by default. It may be enabled only after the user
provides consent, and phone numbers, identity results, and other sensitive
lookup data must never be sent as Analytics parameters.

The app initializes Firebase App Check before rendering. Debug builds use the
Firebase debug provider, so register each logged debug token in the Firebase
console before testing enforced callable Functions. Release builds use App
Attest on Apple platforms and Play Integrity on Android. The App Attest
entitlement resolves to `development` for Debug builds and `production` for
Release builds. Keep
`ENFORCE_APP_CHECK=true` for deployed callable Functions after both release
providers are registered in Firebase.

## Phone lookup release prerequisites

The lookup flow is implemented but intentionally remains unavailable until the
server-side provider gate is configured. Before any deployment, confirm the
approved PII data-use and retention settings with Twilio, Trestle, and Google
Search grounding. Google's current standard Search grounding policy stores
derived search queries and supplied context for up to 3 days for debugging,
and that storage cannot be disabled while using Search grounding. Enable the
Vertex AI API for project `whoo-called`, then
set these Firebase Functions secrets without putting their values in a mobile
bundle or repository:

    TRESTLE_API_KEY
    TWILIO_ACCOUNT_SID
    TWILIO_AUTH_TOKEN
    BRAVE_SEARCH_API_KEY

Gemini 3.5 Flash-Lite with Google Search grounding is the active public-web
provider and uses the deployed Function service account, so it does not need a
new API key. `BRAVE_SEARCH_API_KEY` remains bound only for the dormant fallback.
Keep `ENABLE_BRAVE_SEARCH_FALLBACK=false` so Brave is not called. If it is
enabled in a future deployment, Brave runs only after an operational Google
request failure, never after a valid Google search with zero verified results.

Set `LOOKUP_PROVIDER_CONFIGURED=true` only after the secrets, provider
accounts, public community guidelines, and legal URLs are approved. Deploying
the Functions code creates the `runLookup` Firebase task queue configuration.
This provider migration does not change Firestore rules or indexes and does not
include a TestFlight release.

The no-result policy is controlled by `NO_RESULT_REFUNDS_ENABLED`. When it is
enabled, the first three uncached results per account and UTC calendar month
that contain no identity, caller name, public source, spam source, community
report, carrier, or line-type evidence return the held credit. Later empty
results capture the credit. Technical failures always return the credit and do
not consume no-result protection. Positive cache entries live for 30 days;
empty entries live for 24 hours. Cache hits do not reserve or consume credits.
Evidence-free partial provider failures are not cached, so a provider outage
does not become a 24-hour negative result.

Uncached provider calls reserve 15 cents against the monthly server-side
budget. New uncached calls pause at $225, leaving a $25 buffer beneath the
$250 operating ceiling. Cached results remain available while the circuit
breaker is active. The first rollout should leave
`NO_RESULT_REFUNDS_ENABLED=false` until App Check is enforced, then enable it
for the limited beta and review the first 100 uncached attempts or 30 days.

The current catalog exposes monthly plans only: Plus at $6.99 for 15 monthly
lookups, Pro at $14.99 for 35, and Power at $24.99 for 60. RevenueCat and App
Store Connect remain the storefront price authorities, so confirm those three
prices and remove annual packages from the active offering before release.
Existing annual entitlements remain recognized server-side. Reconcile actual
provider invoices before expanding beyond the beta.

The Vertex AI service has a recurring $10 monthly Cloud Billing budget alert
for project `whoo-called`, with current-spend notifications at 50%, 90%, and
100%. The budget is an alert and is not a hard spending cap.

## Hidden tester Debug tools

The Settings version label reveals tester tools after three taps for Firebase
users whose email is listed in the server-side `DEBUG_TESTER_EMAILS` Functions
parameter. Keep the value empty until approved tester emails are available.
The backend checks the allowlist on every debug action, so the mobile app does
not contain the authorization list.
