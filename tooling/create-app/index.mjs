#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listContractModes, resolveContractMode } from './contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = join(here, 'template');
const versions = JSON.parse(readFileSync(join(here, 'versions.json'), 'utf8'));
const profiles = JSON.parse(readFileSync(join(here, 'profiles.json'), 'utf8'));
const deployments = JSON.parse(readFileSync(join(here, 'deployments.json'), 'utf8'));
const composition = JSON.parse(readFileSync(join(here, 'composition.json'), 'utf8'));
const shellCatalog = Object.fromEntries(composition.shells.map((shell) => [shell.id, shell]));
const deploymentRoot = join(here, 'deployments');
const contractTemplateRoot = join(here, 'contracts');
const ownPackage = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

const commonDependencies = [
  '@tanstack/react-query',
  'antd',
  'react',
  'react-dom',
  'react-router',
  'zod'
];
const commonDevDependencies = [
  '@types/node',
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'typescript',
  'vite',
  'vitest'
];

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const options = { router: 'browser', profile: 'minimal', deployment: 'none', contract: 'none', shell: 'sidebar', force: false };
  while (args.length) {
    const arg = args.shift();
    if (!arg) continue;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--list-profiles') {
      options.listProfiles = true;
      continue;
    }
    if (arg === '--list-deployments') {
      options.listDeployments = true;
      continue;
    }
    if (arg === '--list-contracts') {
      options.listContracts = true;
      continue;
    }
    if (arg === '--list-shells') {
      options.listShells = true;
      continue;
    }
    const name = arg.slice(2);
    const value = args.shift();
    if (!value || value.startsWith('--')) fail(`Missing value for --${name}`);
    options[name] = value;
  }
  return { positional, options };
}

function isValidPackageName(name) {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
}

function isValidAppId(id) {
  return /^[a-z][a-z0-9.-]*$/.test(id);
}

function ensureTarget(target, force) {
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
    return;
  }
  const entries = readdirSync(target);
  if (entries.length && !force) fail(`Target directory is not empty: ${target}. Use --force to overwrite template files.`);
}

function walk(dir) {
  const output = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) output.push(...walk(path));
    else output.push(path);
  }
  return output;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeShellSingleQuoted(value) {
  return String(value).replaceAll("'", "'\\''");
}

function render(text, values) {
  return text.replace(/\{\{([A-Za-z0-9]+)\}\}/g, (_, key) => {
    if (!(key in values)) fail(`Unknown template token: ${key}`);
    return String(values[key]);
  });
}

function versionOf(name) {
  const version = versions[name];
  if (!version) fail(`Missing version snapshot for dependency ${name}`);
  return version;
}

function loadProfileCatalog(profileFile) {
  if (!profileFile) return { catalog: profiles, customNames: new Set() };
  const file = resolve(profileFile);
  if (!existsSync(file)) fail(`Profile file not found: ${file}`);
  const custom = JSON.parse(readFileSync(file, 'utf8'));
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) fail('Profile file must contain a JSON object keyed by profile name');
  for (const name of Object.keys(custom)) {
    if (profiles[name]) fail(`Custom profile cannot override built-in profile ${name}`);
  }

  const resolved = { ...profiles };
  const resolving = new Set();
  const resolveCustom = (name) => {
    if (resolved[name]) return resolved[name];
    const definition = custom[name];
    if (!definition) fail(`Unknown profile extended by custom profile: ${name}`);
    if (resolving.has(name)) fail(`Custom profile inheritance cycle detected at ${name}`);
    resolving.add(name);
    const base = definition.extends ? (profiles[definition.extends] ?? resolveCustom(definition.extends)) : undefined;
    const merge = (key) => [...new Set([...(base?.[key] ?? []), ...(definition[key] ?? [])])];
    const profile = {
      description: definition.description ?? base?.description,
      capabilities: merge('capabilities'),
      foundationPackages: merge('foundationPackages'),
      dependencies: merge('dependencies')
    };
    resolving.delete(name);
    validateProfileDefinition(name, profile);
    resolved[name] = profile;
    return profile;
  };
  for (const name of Object.keys(custom)) resolveCustom(name);
  return { catalog: resolved, customNames: new Set(Object.keys(custom)) };
}

function validateProfileDefinition(name, profile) {
  if (!profile || typeof profile !== 'object') fail(`Invalid profile definition: ${name}`);
  if (typeof profile.description !== 'string' || !profile.description.trim()) fail(`Profile ${name} requires a description`);
  for (const key of ['capabilities', 'foundationPackages', 'dependencies']) {
    if (!Array.isArray(profile[key]) || profile[key].some((value) => typeof value !== 'string' || !value.trim())) {
      fail(`Profile ${name} requires a string array ${key}`);
    }
  }
  if (!profile.capabilities.includes('application-shell') || !profile.capabilities.includes('ui-patterns')) {
    fail(`Profile ${name} must include application-shell and ui-patterns`);
  }
  if (!profile.foundationPackages.includes('app') || !profile.foundationPackages.includes('ui')) {
    fail(`Profile ${name} must include Foundation packages app and ui`);
  }
}

export function listProfiles() {
  return Object.entries(profiles).map(([name, profile]) => ({
    name,
    description: profile.description,
    capabilities: [...profile.capabilities],
    foundationPackages: [...profile.foundationPackages],
    dependencies: [...profile.dependencies]
  }));
}



export function listShells() {
  return composition.shells.map((shell) => ({
    id: shell.id,
    description: shell.description,
    useCases: [...shell.useCases]
  }));
}

export function listDeployments() {
  return Object.entries(deployments).map(([name, deployment]) => ({
    name,
    description: deployment.description,
    nginxImage: deployment.nginxImage,
    files: [...deployment.files]
  }));
}

export function resolveDeployment(name = 'none') {
  const deployment = deployments[name];
  if (!deployment) fail(`Unknown deployment target: ${name}. Available deployments: ${Object.keys(deployments).join(', ')}`);
  return {
    name,
    description: deployment.description,
    nginxImage: deployment.nginxImage,
    files: [...deployment.files]
  };
}

export function resolveProfile(name = 'minimal', foundationVersion = ownPackage.version, profileCatalog = profiles, profileSource = 'builtin') {
  const profile = profileCatalog[name];
  if (!profile) fail(`Unknown profile: ${name}. Available profiles: ${Object.keys(profileCatalog).join(', ')}`);
  validateProfileDefinition(name, profile);
  const dependencies = {};
  for (const packageName of profile.foundationPackages) dependencies[`@foundation/${packageName}`] = `^${foundationVersion}`;
  for (const packageName of commonDependencies) dependencies[packageName] = versionOf(packageName);
  for (const packageName of profile.dependencies) dependencies[packageName] = versionOf(packageName);

  const devDependencies = {};
  for (const packageName of commonDevDependencies) devDependencies[packageName] = versionOf(packageName);
  devDependencies['@foundation/create-app'] = `^${foundationVersion}`;

  return {
    name,
    source: profileSource,
    description: profile.description,
    capabilities: [...profile.capabilities],
    foundationPackages: [...profile.foundationPackages],
    extraDependencies: [...profile.dependencies],
    dependencies,
    devDependencies
  };
}

function generate(target, config) {
  ensureTarget(target, config.force);
  const profile = resolveProfile(config.profile, config.foundationVersion, config.profileCatalog, config.profileSource);
  const deployment = resolveDeployment(config.deployment);
  const contractMode = resolveContractMode(config.contract);
  for (const [name, version] of Object.entries(contractMode.devDependencies)) profile.devDependencies[name] = version;
  const values = {
    packageName: config.packageName,
    appId: config.appId,
    appTitle: config.appTitle,
    appTitleHtml: escapeHtml(config.appTitle),
    appTitleJson: JSON.stringify(config.appTitle).slice(1, -1),
    appTitleShellJson: escapeShellSingleQuoted(JSON.stringify(config.appTitle)),
    routerMode: config.routerMode,
    shellPreset: config.shell,
    foundationVersion: config.foundationVersion,
    packageManager: versions.packageManager,
    nodeEngine: versions.node,
    profile: profile.name,
    profileSource: profile.source,
    profileCapabilities: profile.capabilities.join(', '),
    profileCapabilitiesJson: JSON.stringify(profile.capabilities),
    profileFoundationPackagesJson: JSON.stringify(profile.foundationPackages),
    profileDependenciesJson: JSON.stringify(profile.extraDependencies),
    deployment: deployment.name,
    deploymentDescription: deployment.description,
    contractMode: contractMode.name,
    contractsJson: JSON.stringify(contractMode.contracts, null, 4).replace(/^/gm, '  ').trimStart(),
    nginxImage: deployment.nginxImage ?? '',
    dependenciesJson: JSON.stringify(profile.dependencies, null, 4).replace(/^/gm, '  ').trimStart(),
    devDependenciesJson: JSON.stringify(profile.devDependencies, null, 4).replace(/^/gm, '  ').trimStart()
  };

  for (const source of walk(templateRoot)) {
    const relative = source.slice(templateRoot.length + 1);
    let destinationRelative = relative.endsWith('.tmpl') ? relative.slice(0, -5) : relative;
    if (destinationRelative === 'gitignore') destinationRelative = '.gitignore';
    const destination = join(target, destinationRelative);
    mkdirSync(dirname(destination), { recursive: true });
    const content = readFileSync(source, 'utf8');
    writeFileSync(destination, render(content, values), 'utf8');
  }

  if (deployment.name !== 'none') {
    const selectedRoot = join(deploymentRoot, deployment.name);
    for (const source of walk(selectedRoot)) {
      const relative = source.slice(selectedRoot.length + 1);
      const destinationRelative = relative.endsWith('.tmpl') ? relative.slice(0, -5) : relative;
      const destination = join(target, destinationRelative);
      mkdirSync(dirname(destination), { recursive: true });
      const content = readFileSync(source, 'utf8');
      writeFileSync(destination, render(content, values), 'utf8');
    }
  }

  if (contractMode.name !== 'none') {
    const selectedRoot = join(contractTemplateRoot, contractMode.name);
    for (const source of walk(selectedRoot)) {
      const relative = source.slice(selectedRoot.length + 1);
      const destinationRelative = relative.endsWith('.tmpl') ? relative.slice(0, -5) : relative;
      const destination = join(target, destinationRelative);
      mkdirSync(dirname(destination), { recursive: true });
      const content = readFileSync(source, 'utf8');
      writeFileSync(destination, render(content, values), 'utf8');
    }
  }
}

export function createApp(argv = process.argv.slice(2)) {
  const { positional, options } = parseArgs(argv);
  if (options.listProfiles) {
    return { listProfiles: true, profiles: listProfiles() };
  }
  if (options.listDeployments) {
    return { listDeployments: true, deployments: listDeployments() };
  }
  if (options.listContracts) {
    return { listContracts: true, contracts: listContractModes() };
  }
  if (options.listShells) {
    return { listShells: true, shells: listShells() };
  }
  if (options.help || positional.length === 0) {
    return {
      help: true,
      message: 'Usage: create-foundation-app <target-dir> [--name <package>] [--app-id <id>] [--title <title>] [--router browser|hash] [--shell sidebar|top-nav|workspace|bare] [--profile minimal|management|data-workbench] [--profile-file <json>] [--deployment none|nginx] [--contract none|openapi] [--foundation-version <version>] [--force]\n       create-foundation-app --list-profiles\n       create-foundation-app --list-shells\n       create-foundation-app --list-deployments\n       create-foundation-app --list-contracts'
    };
  }
  if (positional.length !== 1) fail('Exactly one target directory is required');

  const target = resolve(positional[0]);
  const directoryName = basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'foundation-app';
  const packageName = options.name ?? directoryName;
  const appId = options['app-id'] ?? directoryName;
  const appTitle = options.title ?? basename(target);
  const routerMode = options.router ?? 'browser';
  const profile = options.profile ?? 'minimal';
  const shell = options.shell ?? 'sidebar';
  const deployment = options.deployment ?? 'none';
  const contract = options.contract ?? 'none';
  const foundationVersion = options['foundation-version'] ?? ownPackage.version;
  const profileCatalogResult = loadProfileCatalog(options['profile-file']);

  if (!isValidPackageName(packageName)) fail(`Invalid package name: ${packageName}`);
  if (!isValidAppId(appId)) fail(`Invalid application id: ${appId}`);
  if (!['browser', 'hash'].includes(routerMode)) fail(`Invalid router mode: ${routerMode}`);
  if (!profileCatalogResult.catalog[profile]) fail(`Unknown profile: ${profile}. Available profiles: ${Object.keys(profileCatalogResult.catalog).join(', ')}`);
  if (!shellCatalog[shell]) fail(`Unknown shell: ${shell}. Available shells: ${Object.keys(shellCatalog).join(', ')}`);
  if (!deployments[deployment]) fail(`Unknown deployment target: ${deployment}. Available deployments: ${Object.keys(deployments).join(', ')}`);
  resolveContractMode(contract);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(foundationVersion)) fail(`Invalid Foundation version: ${foundationVersion}`);
  if (!String(appTitle).trim()) fail('Application title must not be empty');

  generate(target, {
    packageName,
    appId,
    appTitle,
    routerMode,
    profile,
    shell,
    profileCatalog: profileCatalogResult.catalog,
    profileSource: profileCatalogResult.customNames.has(profile) ? 'custom' : 'builtin',
    deployment,
    contract,
    foundationVersion,
    force: Boolean(options.force)
  });
  return { help: false, target, packageName, appId, appTitle, routerMode, shell, profile, deployment, contract, foundationVersion };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = createApp();
    if (result.listProfiles) {
      for (const profile of result.profiles) {
        console.log(`${profile.name}\t${profile.description}`);
        console.log(`  Capabilities: ${profile.capabilities.join(', ')}`);
        console.log(`  Foundation: ${profile.foundationPackages.map((name) => `@foundation/${name}`).join(', ')}`);
        if (profile.dependencies.length) console.log(`  Upstream peers: ${profile.dependencies.join(', ')}`);
      }
    } else if (result.listShells) {
      for (const shell of result.shells) {
        console.log(`${shell.id}	${shell.description}`);
        console.log(`  Use cases: ${shell.useCases.join(', ')}`);
      }
    } else if (result.listDeployments) {
      for (const deployment of result.deployments) {
        console.log(`${deployment.name}\t${deployment.description}`);
        if (deployment.nginxImage) console.log(`  Image: ${deployment.nginxImage}`);
      }
    } else if (result.listContracts) {
      for (const contract of result.contracts) {
        console.log(`${contract.name}\t${contract.description}`);
        if (contract.contracts.length) console.log(`  Adapter: ${contract.contracts.map((item) => item.adapter).join(', ')}`);
      }
    } else if (result.help) console.log(result.message);
    else console.log(`Created ${result.appTitle} (${result.profile}, shell=${result.shell}, deployment=${result.deployment}, contract=${result.contract}) in ${result.target}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
