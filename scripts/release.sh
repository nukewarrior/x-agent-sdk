#!/usr/bin/env bash
# Release x-agent-sdk: bump, build, test, publish, tag, push, GitHub release.
#
# Usage:
#   ./scripts/release.sh            # bump patch (0.1.9 -> 0.1.10)
#   ./scripts/release.sh minor      # bump minor (0.1.9 -> 0.2.0)
#   ./scripts/release.sh major      # bump major (0.1.9 -> 1.0.0)
#   ./scripts/release.sh 0.2.0      # set an explicit version
#
# Requirements: bun, npm (logged in as publisher), gh (authenticated).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is not clean. Commit or stash first." >&2
  exit 1
fi

NEXT=$(npm version "${1:-patch}" --no-git-tag-version)
VERSION=${NEXT#v}
echo "==> Releasing v${VERSION}"

echo "==> Build"
bun run build

echo "==> Test"
bun test

echo "==> Publish to npm"
npm publish

echo "==> Commit, tag, push"
git add package.json
git commit -m "Bump version to ${VERSION}"
git tag "v${VERSION}"
git push origin main --tags

echo "==> GitHub release"
NOTES_FILE=$(mktemp)
LAST_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
if [ -n "$LAST_TAG" ]; then
  echo "## What's Changed" > "$NOTES_FILE"
  git log --oneline --no-merges "$LAST_TAG"..HEAD | sed 's/^/- /' >> "$NOTES_FILE"
else
  echo "Initial release." > "$NOTES_FILE"
fi
GHA="$HOME/.local/bin/gha"
if [ -x "$GHA" ]; then
  "$GHA" release create "v${VERSION}" --notes-file "$NOTES_FILE" --title "v${VERSION}"
elif command -v gh >/dev/null 2>&1; then
  gh release create "v${VERSION}" --notes-file "$NOTES_FILE" --title "v${VERSION}"
else
  echo "error: gh CLI not found." >&2
  exit 1
fi
rm -f "$NOTES_FILE"

echo "==> Done: v${VERSION} published on npm and GitHub."
