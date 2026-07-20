#!/bin/bash
# ==============================================================================
# Helper Script to Generate Tauri Update Signing Keypair
# ==============================================================================

set -e

echo "Generating Tauri update signing key pair..."
echo "Running: npx @tauri-apps/cli signer generate"
echo ""

npx @tauri-apps/cli signer generate

echo ""
echo "=============================================================================="
echo "INSTRUCTIONS:"
echo "1. Copy the generated PUBLIC KEY string into src-tauri/tauri.conf.json under:"
echo "   plugins -> updater -> pubkey"
echo ""
echo "2. Save the generated PRIVATE KEY string securely!"
echo "   When building release binaries, set it as environment variable:"
echo "   export TAURI_SIGNING_PRIVATE_KEY=\"your_private_key_here\""
echo "=============================================================================="
