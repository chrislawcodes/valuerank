#!/bin/bash
# Install git hooks for the valuerank repository
# Run this script once after cloning the repo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_ROOT="$(git rev-parse --show-toplevel)"

echo "Installing git hooks..."

# Copy pre-push hook
cp "$SCRIPT_DIR/pre-push" "$GIT_ROOT/.git/hooks/pre-push"
chmod +x "$GIT_ROOT/.git/hooks/pre-push"

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will now run lint, test, and build before each push."
echo "To bypass (not recommended): git push --no-verify"
