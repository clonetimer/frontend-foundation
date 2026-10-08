import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
execFileSync(process.execPath, [resolve(root, 'tooling/scripts/design-model-sync.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'tooling/scripts/domain-neutrality-check.mjs')], { cwd: root, stdio: 'inherit' });
for (const script of ['architecture-check.mjs', 'repository-check.mjs', 'capability-check.mjs', 'github-ci-check.mjs']) {
  execFileSync(process.execPath, [resolve(root, 'tooling/scripts', script)], {
    cwd: root,
    stdio: 'inherit'
  });
}


execFileSync(process.execPath, [resolve(root, 'tooling/oss/verify.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'tooling/deployment/verify.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [
  '--test',
  resolve(root, 'tooling/create-app/tests/create-app.test.mjs'),
  resolve(root, 'tooling/create-app/tests/doctor.test.mjs'),
  resolve(root, 'tooling/create-app/tests/generate.test.mjs'),
  resolve(root, 'tooling/create-app/tests/project.test.mjs'),
  resolve(root, 'tooling/create-app/tests/visual-composition.test.mjs'),
  resolve(root, 'tooling/create-app/tests/action-binding.test.mjs'),
  resolve(root, 'tooling/create-app/tests/data-operation.test.mjs'),
  resolve(root, 'tooling/create-app/tests/designer-model.test.mjs'),
  resolve(root, 'tooling/create-app/tests/designer-file.test.mjs'),
  resolve(root, 'tooling/create-app/tests/resource.test.mjs'),
  resolve(root, 'tooling/create-app/tests/contract.test.mjs'),
  resolve(root, 'tooling/create-app/tests/upgrade.test.mjs'),
  resolve(root, 'tooling/create-app/tests/domain-component.test.mjs'),
  resolve(root, 'tooling/create-app/tests/custom-registry.test.mjs'),
  resolve(root, 'tooling/release/tests/release.test.mjs'),
  resolve(root, 'tooling/oss/tests/oss.test.mjs'),
  resolve(root, 'tooling/deployment/tests/deployment.test.mjs')
], {
  cwd: root,
  stdio: 'inherit'
});

console.log('Offline verification passed');
