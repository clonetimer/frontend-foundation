#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectContractState } from './contract.mjs';
import { generateResource } from './resource.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const patternRoot = join(here, 'patterns');
const patterns = JSON.parse(readFileSync(join(here, 'patterns.json'), 'utf8'));
const composition = JSON.parse(readFileSync(join(here, 'composition.json'), 'utf8'));

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function render(text, values) {
  return text.replace(/\{\{([A-Za-z0-9]+)\}\}/g, (_, key) => {
    if (!(key in values)) fail(`Unknown template token: ${key}`);
    return String(values[key]);
  });
}

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const options = { project: '.', pattern: 'page', force: false, index: false, order: '100' };
  while (args.length) {
    const arg = args.shift();
    if (!arg) continue;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (arg === '--force') { options.force = true; continue; }
    if (arg === '--index') { options.index = true; continue; }
    if (arg === '--help') { options.help = true; continue; }
    if (arg === '--list-patterns') { options.listPatterns = true; continue; }
    if (arg === '--list-composition') { options.listComposition = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    const name = arg.slice(2);
    const value = args.shift();
    if (!value || value.startsWith('--')) fail(`Missing value for --${name}`);
    options[name] = value;
  }
  return { positional, options };
}

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSafeRoutePath(value) {
  return /^[a-z0-9][a-z0-9/_-]*$/.test(value) && !value.includes('..') && !value.startsWith('/');
}

function findExistingRoute(modulesDir, route) {
  if (!existsSync(modulesDir)) return undefined;
  for (const moduleName of readdirSync(modulesDir)) {
    const moduleDir = join(modulesDir, moduleName);
    if (!statSync(moduleDir).isDirectory()) continue;
    const manifestFile = join(moduleDir, 'foundation.module.json');
    if (!existsSync(manifestFile)) continue;
    const manifest = readJson(manifestFile);
    if (route.index === true && manifest.route?.index === true) return relative(modulesDir, manifestFile);
    if (typeof route.path === 'string' && manifest.route?.path === route.path) return relative(modulesDir, manifestFile);
  }
  return undefined;
}

function projectConfig(projectRoot) {
  const configFile = join(projectRoot, 'foundation.config.json');
  if (!existsSync(configFile)) {
    fail('foundation.config.json not found. foundation-generate requires a project created or migrated to Frontend Foundation 0.9+.');
  }
  const config = readJson(configFile);
  if (config.schemaVersion !== 1) fail(`Unsupported foundation.config.json schemaVersion: ${String(config.schemaVersion)}`);
  if (!Array.isArray(config.profile?.capabilities)) fail('foundation.config.json profile.capabilities must be an array');
  const modules = config.modules ?? {};
  if (modules.directory !== 'src/modules' || modules.routeFile !== 'routes.ts' || modules.exportName !== 'module') {
    fail('Unsupported module convention in foundation.config.json');
  }
  return config;
}

export function listPatterns() {
  return Object.entries(patterns).map(([name, pattern]) => ({
    name,
    description: pattern.description,
    requiredCapabilities: [...pattern.requiredCapabilities]
  }));
}

export function listComposition() {
  return {
    shells: composition.shells.map((entry) => ({ ...entry, useCases: [...entry.useCases] })),
    layouts: (composition.layouts ?? []).map((entry) => ({ ...entry })),
    widgets: (composition.widgets ?? []).map((entry) => ({ ...entry })),
    blocks: composition.blocks.map((entry) => ({ ...entry })),
    patterns: composition.patterns.map((entry) => ({ ...entry })),
    interaction: composition.interaction ? JSON.parse(JSON.stringify(composition.interaction)) : undefined
  };
}

export function generateModule(argv, runtimeOptions = {}) {
  const { positional, options } = parseArgs(argv);
  if (options.listPatterns) return { listPatterns: true, patterns: listPatterns() };
  if (options.listComposition) return { listComposition: true, json: Boolean(options.json), composition: listComposition() };
  if (options.help || positional.length === 0) {
    return {
      help: true,
      message: 'Usage: foundation-generate module <name> [--project <dir>] [--pattern page|management|data-workbench|dashboard|master-detail|split-pane|workspace] [--title <title>] [--route <path> | --index] [--nav-label <label>] [--permission <resource.action>] [--contract <name>] [--order <number>] [--force]\n       foundation-generate resource <resource.json> [--project <dir>] [--force]\n       foundation-generate --list-patterns\n       foundation-generate --list-composition [--json]'
    };
  }
  if (positional[0] === 'resource') {
    if (positional.length !== 2) fail('foundation-generate resource requires exactly one resource spec path');
    return { help: false, resource: true, ...generateResource(options.project ?? '.', positional[1], { force: options.force }) };
  }
  if (positional[0] !== 'module') fail(`Unknown generator ${positional[0]}. Supported generators: module, resource`);
  if (positional.length !== 2) fail('foundation-generate module requires exactly one module name');

  const projectRoot = resolve(options.project ?? '.');
  const config = projectConfig(projectRoot);
  const patternName = options.pattern ?? 'page';
  const pattern = patterns[patternName];
  if (!pattern) fail(`Unknown pattern: ${patternName}. Available patterns: ${Object.keys(patterns).join(', ')}`);

  const missing = pattern.requiredCapabilities.filter((capability) => !config.profile.capabilities.includes(capability));
  if (missing.length) fail(`Pattern ${patternName} requires missing capabilities: ${missing.join(', ')}`);

  const slug = toSlug(positional[1]);
  if (!slug) fail(`Invalid module name: ${positional[1]}`);
  const title = String(options.title ?? positional[1]).trim();
  if (!title) fail('Module title must not be empty');
  const isIndex = Boolean(options.index);
  if (isIndex && options.route !== undefined) fail('Index modules cannot also declare --route');
  const routePath = isIndex ? undefined : String(options.route ?? slug).trim().replace(/^\/+|\/+$/g, '');
  if (!isIndex && !isSafeRoutePath(routePath)) fail(`Invalid route path: ${routePath}`);
  const route = isIndex ? { index: true } : { path: routePath };
  const order = Number(options.order ?? 100);
  if (!Number.isInteger(order) || order < 0 || order > 100000) fail(`Invalid navigation order: ${options.order}`);
  const permission = String(options.permission ?? `${slug}.update`).trim();
  const navigationLabel = String(options['nav-label'] ?? title).trim();
  if (!navigationLabel) fail('Navigation label must not be empty');
  if (options.permission !== undefined && !permission) fail('Permission must not be empty');

  const contractNames = options.contract === undefined
    ? []
    : String(options.contract).split(',').map((value) => value.trim()).filter(Boolean);
  if (options.contract !== undefined && !contractNames.length) fail('Contract must not be empty');
  if (new Set(contractNames).size !== contractNames.length) fail('Contract names must be unique');
  if (contractNames.length) {
    const configuredContracts = Array.isArray(config.contracts) ? config.contracts : [];
    const available = new Set(configuredContracts.map((contract) => contract?.name).filter(Boolean));
    for (const contractName of contractNames) {
      if (!available.has(contractName)) fail(`Unknown project contract ${contractName}. Available contracts: ${[...available].join(', ') || '(none)'}`);
    }
    if (!runtimeOptions.deferContractReadiness) {
      const state = inspectContractState(projectRoot);
      const blocking = [...state.issues, ...state.warnings].filter((message) =>
        contractNames.some((contractName) => message.includes(`Contract ${contractName}`))
      );
      if (blocking.length) fail(`Contract dependencies are not ready:\n${blocking.join('\n')}`);
    }
  }

  const modulesDir = join(projectRoot, config.modules.directory);
  const moduleDir = join(modulesDir, slug);
  const existingRoute = findExistingRoute(modulesDir, route);
  if (existingRoute && !options.force) fail(`${isIndex ? 'Index route' : `Route path ${routePath}`} is already declared by ${existingRoute}`);
  if (existsSync(moduleDir) && readdirSync(moduleDir).length && !options.force) fail(`Module directory already exists: ${relative(projectRoot, moduleDir)}. Use --force to overwrite generated files.`);

  const values = {
    slug,
    titleJson: JSON.stringify(title),
    navigationLabelJson: JSON.stringify(navigationLabel),
    routePath: routePath ?? '',
    routeJson: JSON.stringify(route),
    order: String(order),
    permissionJson: JSON.stringify(permission),
    permissionMeta: options.permission !== undefined ? `,\n          permission: ${JSON.stringify(permission)}` : '',
    pattern: patternName,
    requiredCapabilitiesJson: JSON.stringify(pattern.requiredCapabilities),
    contractsJson: JSON.stringify(contractNames)
  };
  const generated = [];
  mkdirSync(join(moduleDir, 'pages'), { recursive: true });

  const commonTemplates = [
    [join(patternRoot, isIndex ? 'routes.index.ts.tmpl' : 'routes.ts.tmpl'), join(moduleDir, 'routes.ts')],
    [join(patternRoot, 'index.ts.tmpl'), join(moduleDir, 'index.ts')],
    [join(patternRoot, 'foundation.module.json.tmpl'), join(moduleDir, 'foundation.module.json')]
  ];
  for (const [source, destination] of commonTemplates) {
    writeFileSync(destination, render(readFileSync(source, 'utf8'), values), 'utf8');
    generated.push(relative(projectRoot, destination));
  }
  const pageTemplate = join(patternRoot, patternName, 'page.route.tsx.tmpl');
  const pageDestination = join(moduleDir, 'pages', 'index.route.tsx');
  writeFileSync(pageDestination, render(readFileSync(pageTemplate, 'utf8'), values), 'utf8');
  generated.push(relative(projectRoot, pageDestination));

  return { help: false, projectRoot, module: slug, title, routePath, index: isIndex, pattern: patternName, contracts: contractNames, generated };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = generateModule(process.argv.slice(2));
    if (result.listPatterns) {
      for (const pattern of result.patterns) {
        console.log(`${pattern.name}\t${pattern.description}`);
        console.log(`  Requires: ${pattern.requiredCapabilities.join(', ')}`);
      }
    } else if (result.listComposition) {
      if (result.json) console.log(JSON.stringify(result.composition, null, 2));
      else {
        for (const shell of result.composition.shells) console.log(`shell\t${shell.id}\t${shell.description}`);
        for (const pattern of result.composition.patterns) console.log(`pattern\t${pattern.id}\t${pattern.description}`);
        for (const layout of result.composition.layouts) console.log(`layout\t${layout.id}\t${layout.description}`);
        for (const widget of result.composition.widgets) console.log(`widget\t${widget.id}\t${widget.description}`);
        for (const block of result.composition.blocks) console.log(`block\t${block.id}\t${block.description}`);
      }
    } else if (result.help) {
      console.log(result.message);
    } else {
      const location = result.index ? 'index route' : `route /${result.routePath}`;
      console.log(result.resource
        ? `Generated resource module ${result.module} at route /${result.routePath}`
        : `Generated ${result.pattern} module ${result.module} at ${location}`);
      for (const file of result.generated) console.log(`  ${file}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
