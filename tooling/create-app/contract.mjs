#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contractCatalog = JSON.parse(readFileSync(join(here, 'contracts.json'), 'utf8'));
const lockFileName = 'foundation.contract.lock.json';

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileSha256(file) {
  return sha256Bytes(readFileSync(file));
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const output = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) output.push(...walkFiles(path));
    else output.push(path);
  }
  return output;
}


function parseSemver(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return undefined;
  return match.slice(1).map(Number);
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) fail(`Unsupported semantic version comparison: ${left} vs ${right}`);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function versionMatchesSimpleRange(version, range) {
  const tokens = String(range).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  for (const token of tokens) {
    const match = token.match(/^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/);
    if (!match) fail(`Unsupported admission version range token: ${token}`);
    const operator = match[1] ?? '=';
    const compared = compareSemver(version, match[2]);
    const ok = operator === '>=' ? compared >= 0
      : operator === '<=' ? compared <= 0
        : operator === '>' ? compared > 0
          : operator === '<' ? compared < 0
            : compared === 0;
    if (!ok) return false;
  }
  return true;
}

function packageSegments(name) {
  return name.startsWith('@') ? name.split('/') : [name];
}

function findInstalledPackageJson(fromDir, packageName) {
  let current = resolve(fromDir);
  while (true) {
    const candidate = join(current, 'node_modules', ...packageSegments(packageName), 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function collectInstalledDependencyGraph(projectRoot, rootPackageName) {
  const rootPackageFile = findInstalledPackageJson(projectRoot, rootPackageName);
  if (!rootPackageFile) return { packages: [], missing: [`${rootPackageName} is not installed`] };
  const packages = [];
  const missing = [];
  const visited = new Set();
  const visit = (packageFile) => {
    const absolute = resolve(packageFile);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    const manifest = readJson(absolute);
    packages.push({
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      packageFile: absolute
    });
    const dependencies = { ...(manifest.dependencies ?? {}), ...(manifest.optionalDependencies ?? {}) };
    for (const dependency of Object.keys(dependencies).sort()) {
      const dependencyFile = findInstalledPackageJson(dirname(absolute), dependency);
      if (!dependencyFile) missing.push(`${manifest.name}@${manifest.version} dependency ${dependency} is not installed`);
      else visit(dependencyFile);
    }
  };
  visit(rootPackageFile);
  return { packages, missing };
}

function generatedText(dir) {
  return walkFiles(dir)
    .filter((file) => /\.(?:[cm]?ts|tsx|d\.[cm]?ts)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function treeSha256(dir) {
  const hash = createHash('sha256');
  const files = walkFiles(dir);
  for (const file of files) {
    hash.update(relative(dir, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return { hash: hash.digest('hex'), files: files.map((file) => relative(dir, file).replaceAll('\\', '/')) };
}

function ensureInsideProject(projectRoot, configuredPath, label) {
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) fail(`${label} must be a non-empty project-relative path`);
  const resolved = resolve(projectRoot, configuredPath);
  const prefix = `${resolve(projectRoot)}${sep}`;
  if (resolved !== resolve(projectRoot) && !resolved.startsWith(prefix)) fail(`${label} escapes the project root: ${configuredPath}`);
  return resolved;
}

export function listContractModes() {
  return Object.entries(contractCatalog.modes).map(([name, mode]) => ({
    name,
    description: mode.description,
    runtimeFiles: [...(mode.runtimeFiles ?? [])],
    contracts: mode.contracts.map((contract) => ({ ...contract }))
  }));
}

export function listContractAdapters() {
  return Object.entries(contractCatalog.adapters).map(([id, adapter]) => ({ id, ...adapter }));
}

export function resolveContractMode(name = 'none') {
  const mode = contractCatalog.modes[name];
  if (!mode) fail(`Unknown contract mode: ${name}. Available contract modes: ${Object.keys(contractCatalog.modes).join(', ')}`);
  const contracts = mode.contracts.map((contract) => {
    const adapter = contractCatalog.adapters[contract.adapter];
    if (!adapter) fail(`Contract mode ${name} references unknown adapter ${contract.adapter}`);
    return {
      name: contract.name,
      kind: contract.kind,
      source: contract.source,
      output: contract.output,
      adapter: contract.adapter,
      adapterPackage: adapter.package,
      adapterVersion: adapter.version,
      adapterStability: adapter.stability,
      inputFormats: [...(adapter.inputFormats ?? [])],
      securityGate: adapter.securityGate,
      supportedOpenApi: [...adapter.supportedOpenApi],
      evaluationOpenApi: [...(adapter.evaluationOpenApi ?? [])]
    };
  });
  const devDependencies = {};
  for (const contract of contracts) devDependencies[contract.adapterPackage] = contract.adapterVersion;
  return { name, description: mode.description, runtimeFiles: [...(mode.runtimeFiles ?? [])], contracts, devDependencies };
}

function projectManifest(projectRoot) {
  const file = join(projectRoot, 'foundation.config.json');
  if (!existsSync(file)) fail('foundation.config.json not found');
  const config = readJson(file);
  if (config.schemaVersion !== 1) fail(`Unsupported foundation.config.json schemaVersion: ${String(config.schemaVersion)}`);
  const contracts = config.contracts ?? [];
  if (!Array.isArray(contracts)) fail('foundation.config.json contracts must be an array');
  return { ...config, contractMode: config.contractMode ?? 'none', contracts };
}

function specVersion(sourceFile) {
  const text = readFileSync(sourceFile, 'utf8');
  if (sourceFile.endsWith('.json')) {
    const value = JSON.parse(text)?.openapi;
    return typeof value === 'string' ? value : undefined;
  }
  const match = text.match(/^\s*openapi\s*:\s*['"]?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/m);
  return match?.[1];
}

function minorSpec(version) {
  const match = version?.match(/^(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

function validateContractDefinition(projectRoot, contract, packageJson) {
  const issues = [];
  if (!contract || typeof contract !== 'object') return ['Contract entry must be an object'];
  if (typeof contract.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(contract.name)) issues.push(`Invalid contract name ${String(contract.name)}`);
  if (contract.kind !== 'openapi') issues.push(`Unsupported contract kind ${String(contract.kind)}`);
  const adapter = contractCatalog.adapters[contract.adapter];
  if (!adapter) issues.push(`Unknown contract adapter ${String(contract.adapter)}`);
  if (adapter && contract.adapterVersion !== adapter.version) issues.push(`Contract ${contract.name} adapterVersion ${String(contract.adapterVersion)} differs from supported ${adapter.version}`);
  if (adapter && contract.adapterPackage !== adapter.package) issues.push(`Contract ${contract.name} adapterPackage ${String(contract.adapterPackage)} differs from supported ${adapter.package}`);

  let sourceFile;
  let outputDir;
  try { sourceFile = ensureInsideProject(projectRoot, contract.source, `Contract ${contract.name} source`); }
  catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }
  try { outputDir = ensureInsideProject(projectRoot, contract.output, `Contract ${contract.name} output`); }
  catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }

  if (sourceFile && !existsSync(sourceFile)) issues.push(`Contract ${contract.name} source not found: ${contract.source}`);
  if (sourceFile && adapter?.inputFormats?.length) {
    const extension = contract.source.toLowerCase().split('.').pop();
    if (!extension || !adapter.inputFormats.includes(extension)) {
      issues.push(`Contract ${contract.name} adapter ${contract.adapter} only enables input formats: ${adapter.inputFormats.join(', ')}`);
    }
  }
  if (sourceFile && existsSync(sourceFile) && adapter) {
    try {
      const version = specVersion(sourceFile);
      const minor = minorSpec(version);
      if (!minor) issues.push(`Contract ${contract.name} source does not declare an OpenAPI version`);
      else if (!adapter.supportedOpenApi.includes(minor)) {
        const blockedReason = adapter.blockedOpenApi?.[minor];
        issues.push(blockedReason
          ? `Contract ${contract.name} OpenAPI ${version} is blocked by Foundation: ${blockedReason}`
          : `Contract ${contract.name} OpenAPI ${version} is outside enabled adapter support: ${adapter.supportedOpenApi.join(', ')}`);
      }
    } catch (error) {
      issues.push(`Contract ${contract.name} source could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (adapter) {
    const declared = packageJson.devDependencies?.[adapter.package] ?? packageJson.dependencies?.[adapter.package];
    if (declared !== adapter.version) issues.push(`Contract ${contract.name} requires exact ${adapter.package}@${adapter.version}; found ${String(declared)}`);
  }
  return { issues, sourceFile, outputDir, adapter };
}

export function inspectContractState(projectDir) {
  const projectRoot = resolve(projectDir);
  const issues = [];
  const warnings = [];
  const packageFile = join(projectRoot, 'package.json');
  if (!existsSync(packageFile)) return { root: projectRoot, issues: ['package.json not found'], warnings, contracts: [] };
  const packageJson = readJson(packageFile);
  let config;
  try { config = projectManifest(projectRoot); }
  catch (error) { return { root: projectRoot, issues: [error instanceof Error ? error.message : String(error)], warnings, contracts: [] }; }

  const mode = contractCatalog.modes[config.contractMode];
  if (!mode) issues.push(`Unknown contract mode ${config.contractMode}`);
  else {
    for (const requiredFile of mode.runtimeFiles ?? []) {
      try {
        const resolved = ensureInsideProject(projectRoot, requiredFile, `Contract mode ${config.contractMode} runtime file`);
        if (!existsSync(resolved)) issues.push(`Contract mode ${config.contractMode} requires ${requiredFile}`);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  const names = new Set();
  const lockFile = join(projectRoot, lockFileName);
  const lock = existsSync(lockFile) ? readJson(lockFile) : { schemaVersion: 1, contracts: {} };
  if (lock.schemaVersion !== 1) issues.push(`Unsupported ${lockFileName} schemaVersion ${String(lock.schemaVersion)}`);
  const states = [];

  for (const contract of config.contracts) {
    if (names.has(contract.name)) issues.push(`Duplicate contract name ${contract.name}`);
    names.add(contract.name);
    const validation = validateContractDefinition(projectRoot, contract, packageJson);
    issues.push(...validation.issues);
    const state = { name: contract.name, source: contract.source, output: contract.output, adapter: contract.adapter };
    const locked = lock.contracts?.[contract.name];
    if (!locked) {
      warnings.push(`Contract ${contract.name} has not been generated; ${lockFileName} entry is missing`);
    } else if (validation.sourceFile && existsSync(validation.sourceFile)) {
      const currentSource = fileSha256(validation.sourceFile);
      if (locked.sourceSha256 !== currentSource) issues.push(`Contract ${contract.name} source changed since generation`);
      if (locked.adapter !== contract.adapter || locked.adapterVersion !== contract.adapterVersion) issues.push(`Contract ${contract.name} lock adapter differs from foundation.config.json`);
    }
    if (validation.outputDir) {
      if (!existsSync(validation.outputDir)) warnings.push(`Contract ${contract.name} generated output is missing: ${contract.output}`);
      else {
        const current = treeSha256(validation.outputDir);
        if (!current.files.length) warnings.push(`Contract ${contract.name} generated output is empty: ${contract.output}`);
        else if (locked && locked.outputSha256 !== current.hash) issues.push(`Contract ${contract.name} generated output drift detected`);
        state.outputFiles = current.files;
      }
    }
    states.push(state);
  }

  for (const lockedName of Object.keys(lock.contracts ?? {})) {
    if (!names.has(lockedName)) warnings.push(`${lockFileName} contains removed contract ${lockedName}`);
  }
  return { root: projectRoot, issues, warnings, contracts: states };
}

function runExecutableAdapter(projectRoot, adapterId, inputFile, outputDir, label = adapterId) {
  const adapter = contractCatalog.adapters[adapterId];
  if (!adapter || adapter.package !== '@hey-api/openapi-ts') fail(`Unsupported executable adapter ${adapterId}`);
  const installed = findInstalledPackageJson(projectRoot, adapter.package);
  if (!installed) fail(`${adapter.package}@${adapter.version} is not installed. Run the project package manager install first.`);
  const installedPackage = readJson(installed);
  if (installedPackage.version !== adapter.version) fail(`Installed ${adapter.package}@${installedPackage.version} differs from pinned ${adapter.version}`);

  const temp = mkdtempSync(join(projectRoot, '.foundation-contract-runner-'));
  const runner = join(temp, 'run.mjs');
  const script = [
    `import { createClient } from ${JSON.stringify(adapter.package)};`,
    `await createClient({`,
    `  input: ${JSON.stringify(inputFile)},`,
    `  output: { path: ${JSON.stringify(outputDir)}, clean: true },`,
    `  plugins: ${JSON.stringify(adapter.plugins)}`,
    `});`,
    ''
  ].join('\n');
  writeFileSync(runner, script, 'utf8');
  try {
    const result = spawnSync(process.execPath, [runner], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: '1' }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      fail(`${label} generator failed${detail ? `:\n${detail}` : ''}`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function runHeyApi(projectRoot, contract, outputDir) {
  const sourceFile = ensureInsideProject(projectRoot, contract.source, `Contract ${contract.name} source`);
  runExecutableAdapter(projectRoot, contract.adapter, sourceFile, outputDir, `Contract ${contract.name}`);
}

export function auditContractAdapter(projectDir, adapterId) {
  const projectRoot = resolve(projectDir);
  const adapter = contractCatalog.adapters[adapterId];
  if (!adapter) fail(`Unknown contract adapter ${adapterId}. Available adapters: ${Object.keys(contractCatalog.adapters).join(', ')}`);
  const admission = adapter.admission;
  if (!admission) fail(`Contract adapter ${adapterId} has no admission policy`);
  const issues = [];
  const warnings = [];
  const dependencyGraph = collectInstalledDependencyGraph(projectRoot, adapter.package);
  issues.push(...dependencyGraph.missing);
  const rootPackage = dependencyGraph.packages.find((item) => item.name === adapter.package);
  if (rootPackage) {
    if (rootPackage.version !== adapter.version) issues.push(`Installed ${adapter.package}@${rootPackage.version} differs from pinned ${adapter.version}`);
    if (admission.expectedLicense && rootPackage.license !== admission.expectedLicense) {
      issues.push(`${adapter.package}@${rootPackage.version} license ${String(rootPackage.license)} differs from expected ${admission.expectedLicense}`);
    }
  }
  for (const rule of admission.blockedDependencies ?? []) {
    for (const dependency of dependencyGraph.packages.filter((item) => item.name === rule.package)) {
      try {
        if (versionMatchesSimpleRange(dependency.version, rule.range)) {
          issues.push(`${dependency.name}@${dependency.version} is blocked by ${rule.advisory} (${rule.range})`);
        }
      } catch (error) {
        issues.push(`Could not evaluate ${dependency.name}@${dependency.version}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const fixtureResults = [];
  if (!issues.some((issue) => issue.includes('not installed') || issue.includes('differs from pinned'))) {
    for (const fixture of admission.fixtures ?? []) {
      const inputFile = resolve(here, fixture.file);
      if (!existsSync(inputFile)) {
        issues.push(`Admission fixture not found: ${fixture.file}`);
        continue;
      }
      const temp = mkdtempSync(join(tmpdir(), 'foundation-contract-admission-'));
      try {
        const first = join(temp, 'first');
        const second = join(temp, 'second');
        runExecutableAdapter(projectRoot, adapterId, inputFile, first, `Admission fixture ${fixture.file}`);
        runExecutableAdapter(projectRoot, adapterId, inputFile, second, `Admission fixture ${fixture.file}`);
        const firstTree = treeSha256(first);
        const secondTree = treeSha256(second);
        if (!firstTree.files.length) issues.push(`Admission fixture ${fixture.file} generated no files`);
        if (firstTree.hash !== secondTree.hash) issues.push(`Admission fixture ${fixture.file} output is not deterministic`);
        const text = generatedText(first);
        for (const fragment of fixture.mustContain ?? []) {
          if (!text.includes(fragment)) issues.push(`Admission fixture ${fixture.file} output is missing expected fragment ${fragment}`);
        }
        for (const fragment of fixture.mustNotContain ?? []) {
          if (text.includes(fragment)) issues.push(`Admission fixture ${fixture.file} output contains forbidden runtime fragment ${fragment}`);
        }
        fixtureResults.push({ file: fixture.file, files: firstTree.files, sha256: firstTree.hash });
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    }
  }

  return {
    adapter: adapterId,
    package: adapter.package,
    version: adapter.version,
    catalogStatus: admission.status,
    passed: issues.length === 0,
    issues,
    warnings,
    dependencies: dependencyGraph.packages.map(({ name, version, license }) => ({ name, version, license })),
    fixtures: fixtureResults
  };
}

function selectedContracts(config, name) {
  if (!name) return config.contracts;
  const match = config.contracts.find((contract) => contract.name === name);
  if (!match) fail(`Unknown contract ${name}. Available contracts: ${config.contracts.map((contract) => contract.name).join(', ') || '(none)'}`);
  return [match];
}

function updateLock(projectRoot, contract, outputDir) {
  const file = join(projectRoot, lockFileName);
  const current = existsSync(file) ? readJson(file) : { schemaVersion: 1, contracts: {} };
  current.schemaVersion = 1;
  current.contracts ??= {};
  const sourceFile = ensureInsideProject(projectRoot, contract.source, `Contract ${contract.name} source`);
  const tree = treeSha256(outputDir);
  if (!tree.files.length) fail(`Contract ${contract.name} generator produced no files`);
  current.contracts[contract.name] = {
    adapter: contract.adapter,
    adapterVersion: contract.adapterVersion,
    source: contract.source,
    sourceSha256: fileSha256(sourceFile),
    output: contract.output,
    outputSha256: tree.hash,
    files: tree.files
  };
  writeJson(file, current);
  return current.contracts[contract.name];
}

export function generateContracts(projectDir, name) {
  const projectRoot = resolve(projectDir);
  const config = projectManifest(projectRoot);
  const packageJson = readJson(join(projectRoot, 'package.json'));
  const contracts = selectedContracts(config, name);
  if (!contracts.length) return { root: projectRoot, generated: [] };
  const generated = [];
  for (const contract of contracts) {
    const validation = validateContractDefinition(projectRoot, contract, packageJson);
    if (validation.issues.length) fail(validation.issues.join('\n'));
    runHeyApi(projectRoot, contract, validation.outputDir);
    const lock = updateLock(projectRoot, contract, validation.outputDir);
    generated.push({ name: contract.name, output: contract.output, files: lock.files });
  }
  return { root: projectRoot, generated };
}

export function verifyContracts(projectDir, name) {
  const projectRoot = resolve(projectDir);
  const state = inspectContractState(projectRoot);
  if (state.issues.length || state.warnings.length) fail([...state.issues, ...state.warnings].join('\n'));
  const config = projectManifest(projectRoot);
  const contracts = selectedContracts(config, name);
  const verified = [];
  for (const contract of contracts) {
    const tempRoot = mkdtempSync(join(tmpdir(), 'foundation-contract-verify-'));
    const output = join(tempRoot, 'generated');
    try {
      runHeyApi(projectRoot, contract, output);
      const currentOutput = ensureInsideProject(projectRoot, contract.output, `Contract ${contract.name} output`);
      const expected = treeSha256(currentOutput);
      const regenerated = treeSha256(output);
      if (expected.hash !== regenerated.hash) fail(`Contract ${contract.name} regeneration differs from committed output`);
      verified.push({ name: contract.name, files: regenerated.files });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
  return { root: projectRoot, verified };
}

function parseArgs(argv) {
  const args = [...argv];
  const options = { project: '.' };
  const positional = [];
  while (args.length) {
    const arg = args.shift();
    if (!arg) continue;
    if (arg === '--help') { options.help = true; continue; }
    if (arg === '--list-adapters') { options.listAdapters = true; continue; }
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const value = args.shift();
      if (!value || value.startsWith('--')) fail(`Missing value for --${name}`);
      options[name] = value;
      continue;
    }
    positional.push(arg);
  }
  return { positional, options };
}

export function runContractCommand(argv = process.argv.slice(2)) {
  const { positional, options } = parseArgs(argv);
  if (options.listAdapters) return { listAdapters: true, adapters: listContractAdapters() };
  if (options.help || positional.length === 0) {
    return { help: true, message: 'Usage: foundation-contract generate|verify|status [contract-name] [--project <dir>]\n       foundation-contract audit <adapter-id> [--project <dir>]\n       foundation-contract --list-adapters' };
  }
  if (positional.length > 2) fail('Too many positional arguments');
  const [command, name] = positional;
  if (command === 'generate') return { command, ...generateContracts(options.project, name) };
  if (command === 'verify') return { command, ...verifyContracts(options.project, name) };
  if (command === 'status') return { command, ...inspectContractState(options.project) };
  if (command === 'audit') {
    if (!name) fail('foundation-contract audit requires an adapter id');
    return { command, ...auditContractAdapter(options.project, name) };
  }
  fail(`Unknown contract command ${command}. Supported commands: generate, verify, status, audit`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = runContractCommand();
    if (result.listAdapters) {
      for (const adapter of result.adapters) {
        console.log(`${adapter.id}\t${adapter.description}`);
        console.log(`  ${adapter.package}@${adapter.version} (${adapter.stability})`);
        console.log(`  OpenAPI: ${adapter.supportedOpenApi.join(', ')}`);
        if (adapter.admission?.status) console.log(`  Admission: ${adapter.admission.status}`);
      }
    } else if (result.help) {
      console.log(result.message);
    } else if (result.command === 'status') {
      for (const issue of result.issues) console.error(`ERROR: ${issue}`);
      for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
      if (!result.issues.length && !result.warnings.length) console.log(`Contract state valid (${result.contracts.length} contract${result.contracts.length === 1 ? '' : 's'})`);
      if (result.issues.length) process.exitCode = 1;
    } else if (result.command === 'audit') {
      for (const issue of result.issues) console.error(`ERROR: ${issue}`);
      for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
      console.log(`Adapter ${result.adapter} admission ${result.passed ? 'PASS' : 'FAIL'} (${result.dependencies.length} packages, ${result.fixtures.length} fixtures)`);
      if (!result.passed) process.exitCode = 1;
    } else {
      const items = result.generated ?? result.verified ?? [];
      console.log(`${result.command === 'generate' ? 'Generated' : 'Verified'} ${items.length} contract${items.length === 1 ? '' : 's'}`);
      for (const item of items) console.log(`  ${item.name}: ${item.files.length} files`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
