import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const required = {
  '.github/workflows/ci.yml': [
    'actions/checkout@v7',
    'pnpm/action-setup@v6',
    'actions/setup-node@v7',
    'pnpm install --frozen-lockfile',
    'pnpm deploy:smoke',
    'pnpm consumer:test',
    'pnpm release:preflight',
    'pnpm pack:foundation',
    'actions/upload-artifact@v7'
  ],
  '.github/workflows/security.yml': [
    'actions/dependency-review-action@v5',
    'config-file: ./.github/dependency-review-config.yml',
    'github/codeql-action/init@v4',
    'github/codeql-action/analyze@v4'
  ],
  '.github/workflows/release.yml': [
    'environment: release',
    'pnpm check:release',
    'pnpm release:publish -- --registry "$FOUNDATION_REGISTRY" --tag candidate',
    'pnpm release:publish -- --registry "$FOUNDATION_REGISTRY" --tag candidate --execute',
    'actions/upload-artifact@v7'
  ],
  '.github/workflows/registry-smoke.yml': [
    '@foundation/create-app@$FOUNDATION_VERSION',
    'foundation-doctor . --target "$FOUNDATION_VERSION" --strict',
    'pnpm typecheck',
    'pnpm build'
  ],
  '.github/workflows/promote.yml': [
    'environment: stable-promotion',
    'pnpm release:promote -- --registry "$FOUNDATION_REGISTRY" --tag latest',
    'pnpm release:promote -- --registry "$FOUNDATION_REGISTRY" --tag latest --execute'
  ],
  '.github/workflows/pages.yml': [
    'pnpm storybook:build',
    'actions/configure-pages@v6',
    'actions/upload-pages-artifact@v5'
  ],
  '.github/dependabot.yml': [
    'package-ecosystem: npm',
    'package-ecosystem: github-actions'
  ],
  '.github/dependency-review-config.yml': [
    'fail_on_severity: high'
  ]
};

const failures = [];
for (const [relativePath, tokens] of Object.entries(required)) {
  let source;
  try {
    source = await readFile(resolve(root, relativePath), 'utf8');
  } catch {
    failures.push(`missing ${relativePath}`);
    continue;
  }
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${relativePath} missing required token: ${token}`);
  }
}

// Dependabot may advance deploy-pages to a new supported major. Accept the
// approved majors while still rejecting an arbitrary or missing action.
const pages = await readFile(resolve(root, '.github/workflows/pages.yml'), 'utf8');
if (!/actions\/deploy-pages@v(?:4|5)(?![0-9])/.test(pages)) {
  failures.push('.github/workflows/pages.yml must use approved actions/deploy-pages@v4 or @v5');
}

const release = await readFile(resolve(root, '.github/workflows/release.yml'), 'utf8');
if (release.includes('dist_tag:') || release.includes('--tag latest')) {
  failures.push('release.yml must publish Candidate only; Stable promotion belongs to promote.yml');
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`GitHub CI/CD checks passed (${Object.keys(required).length} files)`);
}
