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
gh release create "v${VERSION}" --generate-notes --title "v${VERSION}"

echo "==> Done: v${VERSION} published on npm and GitHub."
