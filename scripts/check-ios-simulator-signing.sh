#!/bin/sh
set -eu

# Simulator authentication still needs Xcode's embedded entitlements.
# CODE_SIGNING_ALLOWED=NO suppresses them even when the plist is configured.
if [ "${PLATFORM_NAME:-}" = "iphonesimulator" ] &&
   [ "${CODE_SIGNING_ALLOWED:-}" != "YES" ]; then
  echo "error: Whoo Called Simulator sign-in requires CODE_SIGNING_ALLOWED=YES. Disabled signing removes keychain entitlements and causes Google sign-in error -2 (securityd -34018)." >&2
  exit 1
fi
