#!/bin/bash
echo "=== ORION Validator Pack ==="

dfx start --background
dfx deploy

echo "✅ Done! Проверяй через Candid UI."
