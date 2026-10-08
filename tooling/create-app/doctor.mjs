#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectContractState } from './contract.mjs';
import { normalizeResourceSpec } from './resource.mjs';
import { inspectProjectBlueprintState } from './project.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ownPackage = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const profiles = JSON.parse(readFileSync(join(here, 'profiles.json'), 'utf8'));
const deployments = JSON.parse(readFileSync(join(here, 'deployments.json'), 'utf8'));
const patterns = JSON.parse(readFileSync(join(here, 'patterns.json'), 'utf8'));
const composition = JSON.parse(readFileSync(join(here, 'composition.json'), 'utf8'));
const shellIds = new Set(composition.shells.map((shell) => shell.id));

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'coverage', '.git', '.vite'].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function extractFoundationVersion(range) {
  if (typeof range !== 'string') return undefined;
  const match = range.match(/^(?:\^|~)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  return match?.[1];
}

function minorOf(version) {
  const match = version?.match(/^(\d+)\.(\d+)\./);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

export function inspectProject(projectDir, options = {}) {
  const root = resolve(projectDir);
  const issues = [];
  const warnings = [];
  const packageFile = join(root, 'package.json');
  if (!existsSync(packageFile)) return { root, issues: ['package.json not found'], warnings, dependencies: {} };
  const pkg = readJson(packageFile);
  const foundationConfigFile = join(root, 'foundation.config.json');
  const foundationConfig = existsSync(foundationConfigFile) ? readJson(foundationConfigFile) : undefined;
  if (foundationConfig !== undefined && foundationConfig.schemaVersion !== 1) issues.push(`Unsupported foundation.config.json schemaVersion ${String(foundationConfig.schemaVersion)}`);
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const foundation = {};
  for (const section of sections) {
    for (const [name, range] of Object.entries(pkg[section] ?? {})) {
      if (!name.startsWith('@foundation/')) continue;
      foundation[name] = { range, section };
      if (String(range).includes('workspace:') || String(range).includes('catalog:')) {
        issues.push(`${name} uses monorepo-only range ${range}`);
      }
    }
  }

  if (!foundation['@foundation/app']) issues.push('Missing @foundation/app dependency');

  const deploymentName = pkg.foundation?.deployment;
  if (deploymentName !== undefined) {
    const deployment = deployments[deploymentName];
    if (!deployment) {
      issues.push(`Unknown foundation.deployment ${deploymentName}`);
    } else {
      for (const required of deployment.files) {
        if (!existsSync(join(root, required))) issues.push(`Deployment ${deploymentName} requires ${required}`);
      }
    }
  }

  const profileName = foundationConfig?.profile?.name ?? pkg.foundation?.profile;
  const embeddedProfile = foundationConfig?.profile;
  if (foundationConfig && pkg.foundation?.profile && foundationConfig.profile?.name !== pkg.foundation.profile) {
    issues.push(`foundation.config.json profile ${String(foundationConfig.profile?.name)} differs from package.json foundation.profile ${pkg.foundation.profile}`);
  }
  if (profileName !== undefined) {
    const profile = embeddedProfile ?? profiles[profileName];
    if (!profile) {
      issues.push(`Unknown foundation.profile ${profileName}`);
    } else {
      const requiredPackages = Array.isArray(profile.foundationPackages) ? profile.foundationPackages : profiles[profileName]?.foundationPackages ?? [];
      const requiredDependencies = Array.isArray(profile.dependencies) ? profile.dependencies : profiles[profileName]?.dependencies ?? [];
      for (const packageName of requiredPackages) {
        const dependencyName = `@foundation/${packageName}`;
        if (!foundation[dependencyName]) issues.push(`Profile ${profileName} requires ${dependencyName}`);
      }
      for (const dependencyName of requiredDependencies) {
        const declared = sections.some((section) => pkg[section]?.[dependencyName]);
        if (!declared) issues.push(`Profile ${profileName} requires dependency ${dependencyName}`);
      }
    }
  }

  if (foundationConfig) {
    const configuredShell = foundationConfig.ui?.shell;
    if (configuredShell !== undefined && !shellIds.has(configuredShell)) issues.push(`Unknown foundation.config.json ui.shell ${String(configuredShell)}`);
    if (pkg.foundation?.shell !== undefined && configuredShell !== undefined && pkg.foundation.shell !== configuredShell) {
      issues.push(`foundation.config.json ui.shell ${String(configuredShell)} differs from package.json foundation.shell ${String(pkg.foundation.shell)}`);
    }
    if (foundationConfig.foundationVersion && minorOf(foundationConfig.foundationVersion) !== minorOf(options.target ?? ownPackage.version)) {
      warnings.push(`foundation.config.json version ${foundationConfig.foundationVersion} differs from target ${options.target ?? ownPackage.version}`);
    }
    const packageContractMode = pkg.foundation?.contract ?? 'none';
    const configContractMode = foundationConfig.contractMode ?? 'none';
    if (packageContractMode !== configContractMode) issues.push(`foundation.config.json contractMode ${configContractMode} differs from package.json foundation.contract ${packageContractMode}`);
    if (foundationConfig.contracts !== undefined && !Array.isArray(foundationConfig.contracts)) issues.push('foundation.config.json contracts must be an array');
    else {
      const contractState = inspectContractState(root);
      for (const issue of contractState.issues) issues.push(`contract: ${issue}`);
      for (const warning of contractState.warnings) warnings.push(`contract: ${warning}`);
    }
    const moduleConfig = foundationConfig.modules;
    if (moduleConfig?.directory !== 'src/modules' || moduleConfig?.routeFile !== 'routes.ts' || moduleConfig?.exportName !== 'module') {
      issues.push('Unsupported module convention in foundation.config.json');
    } else if (!existsSync(join(root, 'src', 'modules', 'index.ts'))) {
      issues.push('Module convention requires src/modules/index.ts');
    }
  } else if (pkg.foundation?.profile) {
    warnings.push('foundation.config.json not found; project uses legacy profile metadata only');
  }

  if (foundationConfig?.modules?.directory === 'src/modules') {
    const moduleRoot = join(root, 'src', 'modules');
    const seenIds = new Set();
    const seenPaths = new Set();
    if (existsSync(moduleRoot)) {
      for (const entry of readdirSync(moduleRoot)) {
        const dir = join(moduleRoot, entry);
        if (!statSync(dir).isDirectory()) continue;
        const manifestFile = join(dir, 'foundation.module.json');
        if (!existsSync(manifestFile)) {
          warnings.push(`Module ${entry} is missing foundation.module.json`);
          continue;
        }
        const manifest = readJson(manifestFile);
        if (manifest.schemaVersion !== 1) issues.push(`Module ${entry} has unsupported manifest schemaVersion ${String(manifest.schemaVersion)}`);
        if (typeof manifest.id !== 'string' || !manifest.id) issues.push(`Module ${entry} has invalid id`);
        else if (seenIds.has(manifest.id)) issues.push(`Duplicate module id ${manifest.id}`);
        else seenIds.add(manifest.id);
        if (!patterns[manifest.pattern]) issues.push(`Module ${entry} uses unknown pattern ${String(manifest.pattern)}`);
        const required = Array.isArray(manifest.requiredCapabilities) ? manifest.requiredCapabilities : [];
        for (const capability of required) {
          if (!foundationConfig.profile?.capabilities?.includes(capability)) issues.push(`Module ${entry} requires missing capability ${capability}`);
        }
        const moduleContracts = manifest.contracts === undefined ? [] : manifest.contracts;
        if (!Array.isArray(moduleContracts) || moduleContracts.some((name) => typeof name !== 'string' || !name)) {
          issues.push(`Module ${entry} has invalid contracts metadata`);
        } else {
          const configuredContracts = new Set((foundationConfig.contracts ?? []).map((contract) => contract?.name).filter(Boolean));
          for (const contractName of moduleContracts) {
            if (!configuredContracts.has(contractName)) issues.push(`Module ${entry} references unknown contract ${contractName}`);
          }
        }
        const routePath = manifest.route?.path;
        if (typeof routePath === 'string') {
          if (seenPaths.has(routePath)) issues.push(`Duplicate module route path ${routePath}`);
          else seenPaths.add(routePath);
        }
        if (manifest.resource !== undefined) {
          const resource = manifest.resource;
          if (!resource || typeof resource !== 'object' || resource.schemaVersion !== 1 || resource.generatorVersion !== 1 || typeof resource.spec !== 'string' || typeof resource.sha256 !== 'string') {
            issues.push(`Module ${entry} has invalid resource metadata`);
          } else {
            const resourceFile = join(dir, resource.spec);
            if (!existsSync(resourceFile)) issues.push(`Module ${entry} requires resource spec ${resource.spec}`);
            else {
              const source = readFileSync(resourceFile, 'utf8');
              const actualHash = createHash('sha256').update(source).digest('hex');
              if (actualHash !== resource.sha256) issues.push(`Module ${entry} resource spec hash drift`);
              try {
                const parsed = normalizeResourceSpec(JSON.parse(source));
                if (parsed.id !== manifest.id) issues.push(`Module ${entry} resource id ${parsed.id} differs from module id ${String(manifest.id)}`);
                if (parsed.route !== manifest.route?.path) issues.push(`Module ${entry} resource route ${parsed.route} differs from module route ${String(manifest.route?.path)}`);
              } catch (error) {
                issues.push(`Module ${entry} has invalid resource spec: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          }
          for (const requiredFile of ['api.ts', 'types.ts', 'pages/list.route.tsx', 'pages/detail.route.tsx', 'pages/edit.route.tsx']) {
            if (!existsSync(join(dir, requiredFile))) issues.push(`Resource module ${entry} requires ${requiredFile}`);
          }
        }
        for (const requiredFile of ['routes.ts', 'index.ts']) {
          if (!existsSync(join(dir, requiredFile))) issues.push(`Module ${entry} requires ${requiredFile}`);
        }
      }
    }
  }
  const parsedVersions = Object.entries(foundation)
    .filter(([name]) => name !== '@foundation/create-app')
    .map(([name, item]) => [name, extractFoundationVersion(item.range)]);
  for (const [name, version] of parsedVersions) {
    if (!version) warnings.push(`${name} uses non-standard range ${foundation[name].range}; automatic compatibility comparison skipped`);
  }
  const minors = new Set(parsedVersions.map(([, version]) => minorOf(version)).filter(Boolean));
  if (minors.size > 1) issues.push(`Foundation packages span multiple minor lines: ${[...minors].sort().join(', ')}`);

  const target = options.target ?? ownPackage.version;
  const targetMinor = minorOf(target);
  if (targetMinor) {
    for (const [name, version] of parsedVersions) {
      if (version && minorOf(version) !== targetMinor) warnings.push(`${name}@${foundation[name].range} differs from target ${target}`);
    }
  }

  if (!String(pkg.packageManager ?? '').startsWith('pnpm@11.')) warnings.push('packageManager should pin pnpm 11.x');
  if (!existsSync(join(root, 'public', 'runtime-config.json'))) warnings.push('public/runtime-config.json not found');

  const projectBlueprintState = inspectProjectBlueprintState(root);
  for (const issue of projectBlueprintState.issues) issues.push(`project: ${issue}`);
  for (const warning of projectBlueprintState.warnings) warnings.push(`project: ${warning}`);

  const importPattern = /(?:from\s+|import\s*\()(['"])(@foundation\/[^'"/]+\/[^'"]+)\1/g;
  for (const file of walk(join(root, 'src')).filter((file) => /\.(ts|tsx|mts|cts|js|jsx|mjs)$/.test(file))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      issues.push(`Deep Foundation import ${match[2]} in ${relative(root, file)}`);
    }
  }

  return { root, target, issues, warnings, dependencies: foundation };
}

function parseArgs(argv) {
  const args = [...argv];
  const options = { json: false, strict: false };
  let targetDir;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--strict') { options.strict = true; continue; }
    if (arg === '--target') {
      const value = args.shift();
      if (!value) throw new Error('Missing value for --target');
      options.target = value;
      continue;
    }
    if (arg === '--help') { options.help = true; continue; }
    if (arg?.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    if (targetDir) throw new Error('Only one project directory is allowed');
    targetDir = arg;
  }
  return { targetDir: targetDir ?? '.', options };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { targetDir, options } = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: foundation-doctor [project-dir] [--target <version>] [--strict] [--json]');
      process.exit(0);
    }
    const result = inspectProject(targetDir, options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Foundation doctor: ${result.root}`);
      console.log(`Target: ${result.target}`);
      for (const issue of result.issues) console.error(`ERROR: ${issue}`);
      for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
      if (!result.issues.length && !result.warnings.length) console.log('Project compatibility checks passed');
      else if (!result.issues.length) console.log('Project has warnings but no blocking compatibility errors');
    }
    if (result.issues.length || (options.strict && result.warnings.length)) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
