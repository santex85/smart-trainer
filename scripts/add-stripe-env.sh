#!/bin/bash
# Adds Stripe env vars to .env in the current directory (or set ENV_FILE path).

ENV_FILE="${ENV_FILE:-.env}"
STRIPE_BLOCK="
# Stripe (billing)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
"

if [ ! -f "$ENV_FILE" ]; then
  echo "File $ENV_FILE not found. Set ENV_FILE= path to your .env"
  exit 1
fi

if grep -q "STRIPE_SECRET_KEY=" "$ENV_FILE" 2>/dev/null; then
  echo "STRIPE_ vars already present in $ENV_FILE — skipping."
  exit 0
fi

echo "$STRIPE_BLOCK" >> "$ENV_FILE"
echo "Appended Stripe vars to $ENV_FILE"
