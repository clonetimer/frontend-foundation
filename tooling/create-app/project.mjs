#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createApp } from './index.mjs';
import { resolveContractMode } from './contract.mjs';
import { generateModule } from './generate.mjs';
import { generateResource, normalizeResourceSpec } from './resource.mjs';
import { createWidgetDefinitionMap, normalizeVisualComposition, renderVisualCompositionPage } from './visual-composition.mjs';
import { normalizeInteractionModel, validateCompositionInteractions } from './interaction-model.mjs';
import { normalizeDataOperationModel } from './data-operation.mjs';
import { customRegistryFileName, loadCustomRegistry } from './custom-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ownPackage = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const profiles = JSON.parse(readFileSync(join(here, 'profiles.json'), 'utf8'));
const deployments = JSON.parse(readFileSync(join(here, 'deployments.json'), 'utf8'));
const patterns = JSON.parse(readFileSync(join(here, 'patterns.json'), 'utf8'));
const composition = JSON.parse(readFileSync(join(here, 'composition.json'), 'utf8'));
const shellIds = new Set(composition.shells.map((shell) => shell.id));

export const projectBlueprintFileName = 'foundation.project.json';
export const projectStateFileName = 'foundation.project.state.json';
export const projectCompilerVersion = 1;

const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const appIdPattern = /^[a-z][a-z0-9.-]*$/;
const slugPattern = /^[a-z][a-z0-9-]*$/;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function minorLine(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\./);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!plainObject(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalString(value, label) {
  if (value === undefined) return undefined;
  return requireString(value, label);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function posixRelative(root, file) {
  return relative(root, file).split(sep).join('/');
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) files.push(...walk(file));
    else files.push(file);
  }
  return files;
}

function isSafeRoutePath(value) {
  return /^[a-z0-9][a-z0-9/_-]*$/.test(value) && !value.includes('..') && !value.startsWith('/');
}

function resolveInputFile(root, source, label) {
  const value = requireString(source, label);
  if (isAbsolute(value) || value.includes('\\')) fail(`${label} must be a relative POSIX path inside the project`);
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) fail(`${label} must resolve inside the project`);
  if (!existsSync(absolute)) fail(`${label} not found: ${value}`);
  return { source: rel.split(sep).join('/'), absolute };
}

function validateJsonData(value, label, depth = 0) {
  if (depth > 20) fail(`${label} is nested too deeply`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) validateJsonData(value[index], `${label}[${index}]`, depth + 1);
    return;
  }
  if (plainObject(value)) {
    for (const [key, child] of Object.entries(value)) validateJsonData(child, `${label}.${key}`, depth + 1);
    return;
  }
  fail(`${label} must contain JSON-serializable data only`);
}

function normalizeTheme(input) {
  if (input === undefined) return {};
  const theme = requireObject(input, 'theme');
  const output = {};
  if (theme.primaryColor !== undefined) output.primaryColor = requireString(theme.primaryColor, 'theme.primaryColor');
  if (theme.borderRadius !== undefined) {
    if (typeof theme.borderRadius !== 'number' || !Number.isFinite(theme.borderRadius) || theme.borderRadius < 0) fail('theme.borderRadius must be a non-negative finite number');
    output.borderRadius = theme.borderRadius;
  }
  if (theme.fontFamily !== undefined) output.fontFamily = requireString(theme.fontFamily, 'theme.fontFamily');
  for (const key of ['token', 'components']) {
    if (theme[key] !== undefined) {
      requireObject(theme[key], `theme.${key}`);
      validateJsonData(theme[key], `theme.${key}`);
      output[key] = theme[key];
    }
  }
  if (theme.layout !== undefined) {
    const layout = requireObject(theme.layout, 'theme.layout');
    const normalizedLayout = {};
    for (const key of ['sidebarWidth', 'headerHeight', 'contentPadding', 'contentMaxWidth']) {
      if (layout[key] === undefined) continue;
      if (typeof layout[key] !== 'number' || !Number.isFinite(layout[key]) || layout[key] < 0) fail(`theme.layout.${key} must be a non-negative finite number`);
      normalizedLayout[key] = layout[key];
    }
    output.layout = normalizedLayout;
  }
  return output;
}

function normalizePage(input, index, profile, contractNames, customWidgets = []) {
  const page = requireObject(input, `pages[${index}]`);
  const id = requireString(page.id, `pages[${index}].id`);
  if (!slugPattern.test(id)) fail(`pages[${index}].id must be a lowercase slug`);
  const title = requireString(page.title, `pages[${index}].title`);
  const pattern = requireString(page.pattern ?? 'page', `pages[${index}].pattern`);
  const patternDefinition = patterns[pattern];
  if (!patternDefinition) fail(`pages[${index}].pattern references unknown pattern ${pattern}`);
  const missing = patternDefinition.requiredCapabilities.filter((capability) => !profile.capabilities.includes(capability));
  if (missing.length) fail(`Page ${id} pattern ${pattern} requires missing capabilities: ${missing.join(', ')}`);
  const isIndex = page.index === true;
  if (page.index !== undefined && typeof page.index !== 'boolean') fail(`pages[${index}].index must be boolean`);
  if (isIndex && page.route !== undefined) fail(`Index page ${id} cannot declare route`);
  const route = isIndex ? undefined : String(page.route ?? id).trim().replace(/^\/+|\/+$/g, '');
  if (!isIndex && !isSafeRoutePath(route)) fail(`Page ${id} has invalid route ${route}`);
  const permission = optionalString(page.permission, `pages[${index}].permission`);
  const contracts = page.contracts === undefined ? [] : page.contracts;
  if (!Array.isArray(contracts) || contracts.some((name) => typeof name !== 'string' || !name.trim())) fail(`pages[${index}].contracts must be a string array`);
  const normalizedContracts = contracts.map((name) => name.trim());
  if (new Set(normalizedContracts).size !== normalizedContracts.length) fail(`Page ${id} has duplicate contracts`);
  for (const name of normalizedContracts) if (!contractNames.has(name)) fail(`Page ${id} references unknown contract ${name}`);
  const stateOnly = normalizeInteractionModel({ state: page.state }, `pages[${index}]`);
  const dataModel = normalizeDataOperationModel({ dataSources: page.dataSources, operations: page.operations }, stateOnly.state, `pages[${index}]`);
  if (dataModel.operations.length && !profile.capabilities.includes('api-transport')) {
    fail(`Page ${id} declares HTTP operations but profile is missing api-transport capability`);
  }
  const interactions = normalizeInteractionModel(
    { state: page.state, actions: page.actions },
    `pages[${index}]`,
    { operationIds: dataModel.operationIds }
  );
  const hasInteractions = interactions.state.length > 0 || interactions.actions.length > 0 || dataModel.dataSources.length > 0 || dataModel.operations.length > 0;
  const composition = page.composition === undefined
    ? undefined
    : normalizeVisualComposition(page.composition, `pages[${index}].composition`, { customWidgets });
  if (hasInteractions && !composition) fail(`Page ${id} declares state/actions/data operations but has no visual composition`);
  if (composition) validateCompositionInteractions(composition.root, interactions, `pages[${index}].composition`, { widgetDefinitions: createWidgetDefinitionMap(customWidgets) });
  return {
    id,
    title,
    pattern,
    ...(isIndex ? { index: true } : { route }),
    ...(permission ? { permission } : {}),
    ...(normalizedContracts.length ? { contracts: normalizedContracts } : {}),
    ...(interactions.state.length ? { state: interactions.state } : {}),
    ...(interactions.actions.length ? { actions: interactions.actions } : {}),
    ...(dataModel.dataSources.length ? { dataSources: dataModel.dataSources } : {}),
    ...(dataModel.operations.length ? { operations: dataModel.operations } : {}),
    ...(composition ? { composition: composition.root } : {})
  };
}

function normalizeNavigation(input, targets) {
  const defaults = targets.map((target, index) => ({ target: target.id, label: target.title, order: index * 10 }));
  if (input === undefined) return { items: defaults };
  const navigation = requireObject(input, 'navigation');
  if (!Array.isArray(navigation.items)) fail('navigation.items must be an array');
  const items = navigation.items.map((item, index) => {
    const value = requireObject(item, `navigation.items[${index}]`);
    const target = requireString(value.target, `navigation.items[${index}].target`);
    const label = requireString(value.label, `navigation.items[${index}].label`);
    const order = value.order ?? index * 10;
    if (!Number.isInteger(order) || order < 0 || order > 100000) fail(`navigation.items[${index}].order must be an integer between 0 and 100000`);
    return { target, label, order };
  });
  const targetIds = new Set(targets.map((target) => target.id));
  const seen = new Set();
  for (const item of items) {
    if (!targetIds.has(item.target)) fail(`navigation target ${item.target} does not match a page or resource`);
    if (seen.has(item.target)) fail(`Duplicate navigation target ${item.target}`);
    seen.add(item.target);
  }
  for (const target of targetIds) if (!seen.has(target)) fail(`navigation is missing target ${target}`);
  return { items };
}

export function loadProjectBlueprint(file = projectBlueprintFileName) {
  const absoluteFile = resolve(file);
  if (!existsSync(absoluteFile)) fail(`Project Blueprint not found: ${absoluteFile}`);
  const root = dirname(absoluteFile);
  const input = readJson(absoluteFile);
  if (!plainObject(input)) fail('Project Blueprint must be a JSON object');
  if (input.schemaVersion !== 1) fail(`Unsupported Project Blueprint schemaVersion: ${String(input.schemaVersion)}`);

  const projectInput = requireObject(input.project, 'project');
  const id = requireString(projectInput.id, 'project.id');
  if (!appIdPattern.test(id)) fail(`Invalid project.id: ${id}`);
  const packageName = String(projectInput.packageName ?? id).trim();
  if (!packageNamePattern.test(packageName)) fail(`Invalid project.packageName: ${packageName}`);
  const title = requireString(projectInput.title, 'project.title');

  const foundationInput = requireObject(input.foundation, 'foundation');
  const version = String(foundationInput.version ?? ownPackage.version).trim();
  if (!semverPattern.test(version)) fail(`Invalid foundation.version: ${version}`);
  if (minorLine(version) !== minorLine(ownPackage.version)) {
    fail(`Project Blueprint compiler ${ownPackage.version} targets Foundation ${minorLine(ownPackage.version)}.x; found ${version}. Upgrade the project/tooling line together.`);
  }
  const profileName = requireString(foundationInput.profile ?? 'minimal', 'foundation.profile');
  const profile = profiles[profileName];
  if (!profile) fail(`Unknown foundation.profile ${profileName}. Available profiles: ${Object.keys(profiles).join(', ')}`);
  const shell = requireString(foundationInput.shell ?? 'sidebar', 'foundation.shell');
  if (!shellIds.has(shell)) fail(`Unknown foundation.shell ${shell}. Available shells: ${[...shellIds].join(', ')}`);
  const router = requireString(foundationInput.router ?? 'browser', 'foundation.router');
  if (!['browser', 'hash'].includes(router)) fail(`Invalid foundation.router ${router}`);
  const deployment = requireString(foundationInput.deployment ?? 'none', 'foundation.deployment');
  if (!deployments[deployment]) fail(`Unknown foundation.deployment ${deployment}`);
  const contract = requireString(foundationInput.contract ?? 'none', 'foundation.contract');
  const contractMode = resolveContractMode(contract);
  const contractNames = new Set(contractMode.contracts.map((entry) => entry.name));
  const customRegistry = loadCustomRegistry(root, composition);
  const customWidgets = customRegistry.registry.definitions;

  if (!Array.isArray(input.pages) || input.pages.length === 0) fail('Project Blueprint requires a non-empty pages array');
  const pages = input.pages.map((page, index) => normalizePage(page, index, profile, contractNames, customWidgets));
  const indexPages = pages.filter((page) => page.index);
  if (indexPages.length !== 1) fail(`Project Blueprint requires exactly one index page; found ${indexPages.length}`);

  const resourceSpecs = new Map();
  const resourcesInput = input.resources ?? [];
  if (!Array.isArray(resourcesInput)) fail('resources must be an array');
  const resources = resourcesInput.map((entry, index) => {
    const resource = requireObject(entry, `resources[${index}]`);
    const resolvedSource = resolveInputFile(root, resource.source, `resources[${index}].source`);
    const spec = normalizeResourceSpec(readJson(resolvedSource.absolute));
    const missing = patterns.management.requiredCapabilities.filter((capability) => !profile.capabilities.includes(capability));
    if (missing.length) fail(`Resource ${spec.id} requires missing capabilities: ${missing.join(', ')}`);
    if (spec.contract && !contractNames.has(spec.contract)) fail(`Resource ${spec.id} references unknown contract ${spec.contract}`);
    resourceSpecs.set(resolvedSource.source, { absolute: resolvedSource.absolute, spec, text: normalizedText(spec) });
    return { source: resolvedSource.source };
  });

  const pageTargets = pages.map((page) => ({ id: page.id, title: page.title, route: page.index ? undefined : page.route, index: page.index === true, kind: 'page' }));
  const resourceTargets = resources.map((resource) => {
    const spec = resourceSpecs.get(resource.source).spec;
    return { id: spec.id, title: spec.title, route: spec.route, index: false, kind: 'resource' };
  });
  const targets = [...pageTargets, ...resourceTargets];
  const ids = new Set();
  for (const target of targets) {
    if (ids.has(target.id)) fail(`Duplicate project target id ${target.id}`);
    ids.add(target.id);
  }
  const routes = new Set();
  for (const target of targets) {
    if (target.index) continue;
    if (routes.has(target.route)) fail(`Duplicate project route ${target.route}`);
    routes.add(target.route);
  }

  const navigation = normalizeNavigation(input.navigation, targets);
  const theme = normalizeTheme(input.theme);
  const blueprint = {
    schemaVersion: 1,
    project: { id, packageName, title },
    foundation: { version, profile: profileName, shell, router, deployment, contract },
    theme,
    navigation,
    pages,
    resources
  };
  const inputHashes = { [projectBlueprintFileName]: sha256(normalizedText(blueprint)) };
  if (customRegistry.exists) inputHashes[customRegistryFileName] = sha256(normalizedText(customRegistry.registry));
  for (const [source, resource] of [...resourceSpecs.entries()].sort(([a], [b]) => a.localeCompare(b))) inputHashes[source] = sha256(resource.text);
  const projectHash = sha256(normalizedText({
    blueprint,
    registry: customRegistry.registry,
    resources: Object.fromEntries([...resourceSpecs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, value]) => [source, value.spec]))
  }));
  return { file: absoluteFile, root, blueprint, profile, contractMode, resourceSpecs, customRegistry, inputHashes, projectHash };
}

export function diagnoseProjectBlueprint(file = projectBlueprintFileName) {
  try {
    const loaded = loadProjectBlueprint(file);
    return {
      valid: true,
      project: loaded.blueprint.project.id,
      projectSha256: loaded.projectHash,
      diagnostics: []
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let code = 'BLUEPRINT_INVALID';
    let source = projectBlueprintFileName;
    if (/foundation\.registry\.json|custom widget|custom component|Custom registry/i.test(message)) {
      code = 'REGISTRY_INVALID';
      source = customRegistryFileName;
    } else if (/resource/i.test(message)) {
      code = 'RESOURCE_INVALID';
    } else if (/composition|layout|widget|binding|event/i.test(message)) {
      code = 'COMPOSITION_INVALID';
    } else if (/operation|data source|api-transport/i.test(message)) {
      code = 'DATA_OPERATION_INVALID';
    } else if (/action|state/i.test(message)) {
      code = 'INTERACTION_INVALID';
    }
    return {
      valid: false,
      diagnostics: [{ code, severity: 'error', source, message }]
    };
  }
}

export function normalizeProjectBlueprint(input, options = {}) {
  const root = resolve(options.root ?? '.');
  const temporary = join(root, `.foundation-project-normalize-${process.pid}.json`);
  if (existsSync(temporary)) fail(`Temporary normalization path already exists: ${temporary}`);
  writeFileSync(temporary, normalizedText(input), 'utf8');
  try { return loadProjectBlueprint(temporary).blueprint; }
  finally { rmSync(temporary, { force: true }); }
}

function navigationFor(blueprint, targetId) {
  const item = blueprint.navigation.items.find((entry) => entry.target === targetId);
  if (!item) fail(`Internal error: navigation target ${targetId} not found`);
  return item;
}

function writeProjectTheme(stageRoot, theme) {
  const file = join(stageRoot, 'src', 'app', 'project-theme.ts');
  const content = [
    '/** Generated from foundation.project.json. Ownership: generated-owned. */',
    `export const projectBrandTheme = ${JSON.stringify(theme, null, 2)};`,
    ''
  ].join('\n');
  writeFileSync(file, content, 'utf8');
}

function applyCustomRegistryDependencies(stageRoot, registry) {
  const entries = Object.entries(registry.packages ?? {});
  if (!entries.length) return;
  const packageFile = join(stageRoot, 'package.json');
  const manifest = readJson(packageFile);
  manifest.dependencies ??= {};
  for (const [name, version] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (manifest.dependencies[name] && manifest.dependencies[name] !== version) {
      fail(`Custom registry package ${name}@${version} conflicts with generated dependency ${manifest.dependencies[name]}`);
    }
    manifest.dependencies[name] = version;
  }
  manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(packageFile, normalizedText(manifest), 'utf8');
}

function stageProject(loaded) {
  const stageRoot = mkdtempSync(join(tmpdir(), 'foundation-project-'));
  const { blueprint } = loaded;
  try {
    createApp([
      stageRoot,
      '--name', blueprint.project.packageName,
      '--app-id', blueprint.project.id,
      '--title', blueprint.project.title,
      '--router', blueprint.foundation.router,
      '--profile', blueprint.foundation.profile,
      '--shell', blueprint.foundation.shell,
      '--deployment', blueprint.foundation.deployment,
      '--contract', blueprint.foundation.contract,
      '--foundation-version', blueprint.foundation.version
    ]);
    applyCustomRegistryDependencies(stageRoot, loaded.customRegistry.registry);

    rmSync(join(stageRoot, 'src', 'modules', 'home'), { recursive: true, force: true });

    for (const page of blueprint.pages) {
      const navigation = navigationFor(blueprint, page.id);
      const args = ['module', page.id, '--project', stageRoot, '--pattern', page.pattern, '--title', page.title, '--nav-label', navigation.label, '--order', String(navigation.order)];
      if (page.index) args.push('--index');
      else args.push('--route', page.route);
      if (page.permission) args.push('--permission', page.permission);
      if (page.contracts?.length) args.push('--contract', page.contracts.join(','));
      generateModule(args, { deferContractReadiness: true });
      if (page.composition) {
        const pageFile = join(stageRoot, 'src', 'modules', page.id, 'pages', 'index.route.tsx');
        writeFileSync(pageFile, renderVisualCompositionPage({
          title: page.title,
          composition: { root: page.composition },
          interactions: { state: page.state ?? [], actions: page.actions ?? [] },
          dataModel: { dataSources: page.dataSources ?? [], operations: page.operations ?? [] },
          customWidgets: loaded.customRegistry.registry.definitions
        }), 'utf8');
      }
    }

    for (const resource of blueprint.resources) {
      const loadedResource = loaded.resourceSpecs.get(resource.source);
      const navigation = navigationFor(blueprint, loadedResource.spec.id);
      generateResource(stageRoot, loadedResource.absolute, {
        navigationLabel: navigation.label,
        navigationOrder: navigation.order,
        deferContractReadiness: true
      });
    }

    writeProjectTheme(stageRoot, blueprint.theme);
    return stageRoot;
  } catch (error) {
    rmSync(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

function ownershipFor(path) {
  if (path === 'README.md' || path === '.gitignore' || path === 'src/main.tsx' || path === 'src/app/runtime-config.ts') return 'scaffold-once';
  if (path.startsWith('contracts/')) return 'scaffold-once';
  if (path.startsWith('src/contracts/')) return 'scaffold-once';
  if (/^src\/modules\/[^/]+\/pages\//.test(path)) return 'scaffold-once';
  if (/^src\/modules\/[^/]+\/(?:api|types)\.ts$/.test(path)) return 'scaffold-once';
  return 'generated-owned';
}

function loadPreviousState(root) {
  const file = join(root, projectStateFileName);
  if (!existsSync(file)) return undefined;
  const state = readJson(file);
  if (state.schemaVersion !== 1 || state.compilerVersion !== projectCompilerVersion || !plainObject(state.files)) fail(`Unsupported ${projectStateFileName}`);
  return state;
}

function buildStageMap(stageRoot) {
  const map = new Map();
  for (const file of walk(stageRoot)) {
    const path = posixRelative(stageRoot, file);
    const content = readFileSync(file);
    map.set(path, { path, content, sha256: sha256(content), ownership: ownershipFor(path) });
  }
  return map;
}

function currentHash(file) {
  return existsSync(file) ? sha256(readFileSync(file)) : undefined;
}

function buildSyncPlan(targetRoot, stageMap, previousState, forceGenerated) {
  const conflicts = [];
  const writes = [];
  const deletes = [];
  const nextFiles = {};

  for (const [path, staged] of stageMap) {
    const targetFile = join(targetRoot, path);
    const exists = existsSync(targetFile);
    const previous = previousState?.files?.[path];
    const current = currentHash(targetFile);

    if (staged.ownership === 'generated-owned') {
      if (exists && !forceGenerated) {
        if (!previous || previous.ownership !== 'generated-owned') conflicts.push(`${path}: existing file is not owned by the Project Compiler`);
        else if (current !== previous.sha256) conflicts.push(`${path}: generated-owned file was modified after the last compile`);
      }
      writes.push(staged);
      nextFiles[path] = { ownership: 'generated-owned', sha256: staged.sha256 };
      continue;
    }

    if (!exists) {
      writes.push(staged);
      nextFiles[path] = { ownership: 'scaffold-once', sha256: staged.sha256 };
    } else if (previous?.ownership === 'scaffold-once') {
      if (staged.sha256 === previous.sha256) {
        // Generated scaffold did not change. Preserve any human edits.
        nextFiles[path] = { ownership: 'scaffold-once', sha256: previous.sha256 };
      } else if (current === previous.sha256) {
        // Blueprint/template changed, but the scaffold is still untouched: safe regeneration.
        writes.push(staged);
        nextFiles[path] = { ownership: 'scaffold-once', sha256: staged.sha256 };
      } else {
        conflicts.push(`${path}: scaffold generation changed and the file also has human modifications`);
        nextFiles[path] = { ownership: 'scaffold-once', sha256: previous.sha256 };
      }
    } else if (previous?.ownership === 'human-owned') {
      nextFiles[path] = { ownership: 'human-owned', sha256: previous.sha256 };
    } else if (!previous) {
      nextFiles[path] = { ownership: 'human-owned', sha256: current };
    } else {
      nextFiles[path] = { ownership: 'human-owned', sha256: current };
    }
  }

  for (const [path, previous] of Object.entries(previousState?.files ?? {})) {
    if (stageMap.has(path)) continue;
    const targetFile = join(targetRoot, path);
    if (!existsSync(targetFile)) continue;
    const current = currentHash(targetFile);
    if (previous.ownership === 'generated-owned') {
      if (!forceGenerated && current !== previous.sha256) conflicts.push(`${path}: removed generated-owned file has local modifications`);
      else deletes.push(path);
    } else if (previous.ownership === 'scaffold-once') {
      if (current === previous.sha256) deletes.push(path);
      else conflicts.push(`${path}: removed scaffold has human modifications; archive or delete it explicitly`);
    }
  }

  return { conflicts, writes, deletes, nextFiles };
}

function writeState(root, loaded, files) {
  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const sortedInputs = Object.fromEntries(Object.entries(loaded.inputHashes).sort(([a], [b]) => a.localeCompare(b)));
  const state = {
    schemaVersion: 1,
    compilerVersion: projectCompilerVersion,
    foundationVersion: loaded.blueprint.foundation.version,
    projectSha256: loaded.projectHash,
    inputs: sortedInputs,
    files: sortedFiles
  };
  writeFileSync(join(root, projectStateFileName), normalizedText(state), 'utf8');
  return state;
}

export function compileProjectBlueprint(file = projectBlueprintFileName, options = {}) {
  const loaded = loadProjectBlueprint(file);
  const targetRoot = resolve(options.target ?? loaded.root);
  if (targetRoot !== loaded.root) fail('Project Blueprint v1 compiles in-place; the target must be the Blueprint directory');
  mkdirSync(targetRoot, { recursive: true });
  const previousState = loadPreviousState(targetRoot);
  const stageRoot = stageProject(loaded);
  try {
    const stageMap = buildStageMap(stageRoot);
    const plan = buildSyncPlan(targetRoot, stageMap, previousState, Boolean(options.forceGenerated));
    if (plan.conflicts.length) fail(`Project compile blocked by ownership conflicts:\n${plan.conflicts.map((item) => `- ${item}`).join('\n')}`);

    for (const path of plan.deletes) unlinkSync(join(targetRoot, path));
    for (const staged of plan.writes) {
      const targetFile = join(targetRoot, staged.path);
      mkdirSync(dirname(targetFile), { recursive: true });
      writeFileSync(targetFile, staged.content);
    }
    const state = writeState(targetRoot, loaded, plan.nextFiles);
    return {
      root: targetRoot,
      project: loaded.blueprint.project.id,
      projectSha256: loaded.projectHash,
      generatedOwned: Object.values(state.files).filter((entry) => entry.ownership === 'generated-owned').length,
      scaffoldOnce: Object.values(state.files).filter((entry) => entry.ownership === 'scaffold-once').length,
      humanOwned: Object.values(state.files).filter((entry) => entry.ownership === 'human-owned').length,
      written: plan.writes.map((entry) => entry.path),
      deleted: plan.deletes
    };
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}

export function inspectProjectBlueprintState(projectDir = '.') {
  const root = resolve(projectDir);
  const issues = [];
  const warnings = [];
  const blueprintFile = join(root, projectBlueprintFileName);
  const stateFile = join(root, projectStateFileName);
  if (!existsSync(blueprintFile) && !existsSync(stateFile)) return { root, managed: false, issues, warnings };
  if (!existsSync(blueprintFile)) return { root, managed: true, issues: [`${projectBlueprintFileName} is missing`], warnings };
  if (!existsSync(stateFile)) return { root, managed: true, issues: [], warnings: [`${projectStateFileName} is missing; run foundation-project compile`] };

  let loaded;
  try { loaded = loadProjectBlueprint(blueprintFile); }
  catch (error) { return { root, managed: true, issues: [error instanceof Error ? error.message : String(error)], warnings }; }

  let state;
  try { state = readJson(stateFile); }
  catch (error) { return { root, managed: true, issues: [`Invalid ${projectStateFileName}: ${error instanceof Error ? error.message : String(error)}`], warnings }; }
  if (state.schemaVersion !== 1 || state.compilerVersion !== projectCompilerVersion || !plainObject(state.files) || !plainObject(state.inputs)) {
    issues.push(`Unsupported ${projectStateFileName}`);
    return { root, managed: true, issues, warnings };
  }
  if (state.projectSha256 !== loaded.projectHash) issues.push('Project Blueprint inputs changed since the last compile');
  for (const [source, expected] of Object.entries(state.inputs)) {
    const actual = loaded.inputHashes[source];
    if (actual === undefined) issues.push(`Project input ${source} is no longer declared`);
    else if (actual !== expected) issues.push(`Project input ${source} drift detected`);
  }
  for (const [path, entry] of Object.entries(state.files)) {
    const file = join(root, path);
    if (!existsSync(file)) {
      if (entry.ownership === 'generated-owned') issues.push(`Project generated-owned file is missing: ${path}`);
      else warnings.push(`Project ${entry.ownership} file is missing: ${path}`);
      continue;
    }
    if (entry.ownership === 'generated-owned') {
      const actual = currentHash(file);
      if (actual !== entry.sha256) issues.push(`Project generated-owned drift detected: ${path}`);
    }
  }
  return { root, managed: true, projectSha256: loaded.projectHash, issues, warnings };
}


function parseQuotedLiteral(source, pattern) {
  const match = source.match(pattern);
  if (!match) return undefined;
  const quote = match[1];
  const body = match[2];
  if (quote === '"') {
    try { return JSON.parse(`"${body}"`); }
    catch { return body; }
  }
  return body.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function readRouteMetadata(moduleDir, fallbackTitle, fallbackOrder) {
  const file = join(moduleDir, 'routes.ts');
  if (!existsSync(file)) return { title: fallbackTitle, label: fallbackTitle, order: fallbackOrder };
  const source = readFileSync(file, 'utf8');
  const title = parseQuotedLiteral(source, /title:\s*(["'])(.*?)\1/s) ?? fallbackTitle;
  const navigation = source.match(/navigation:\s*\{\s*label:\s*(["'])(.*?)\1\s*,\s*order:\s*(\d+)/s);
  let label = title;
  let order = fallbackOrder;
  if (navigation) {
    const navQuote = navigation[1];
    const navBody = navigation[2];
    if (navQuote === '"') {
      try { label = JSON.parse(`"${navBody}"`); }
      catch { label = navBody; }
    } else label = navBody.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    order = Number(navigation[3]);
  }
  const permission = parseQuotedLiteral(source, /permission:\s*(["'])(.*?)\1/s);
  return { title, label, order, ...(permission ? { permission } : {}) };
}

function readExistingTheme(root, warnings) {
  const file = join(root, 'src', 'app', 'project-theme.ts');
  if (!existsSync(file)) return {};
  const source = readFileSync(file, 'utf8');
  const match = source.match(/export\s+const\s+projectBrandTheme\s*=\s*([\s\S]*?);\s*(?:\n|$)/);
  if (!match) {
    warnings.push('Could not infer theme from src/app/project-theme.ts; emitted an empty theme object');
    return {};
  }
  try {
    const parsed = JSON.parse(match[1]);
    return normalizeTheme(parsed);
  } catch {
    warnings.push('src/app/project-theme.ts is not a JSON-literal theme; emitted an empty theme object');
    return {};
  }
}

function readExistingAppId(root, fallback) {
  const file = join(root, 'src', 'app', 'application.ts');
  if (!existsSync(file)) return fallback;
  const source = readFileSync(file, 'utf8');
  return parseQuotedLiteral(source, /\bid:\s*(["'])(.*?)\1/s) ?? fallback;
}

export function planProjectBlueprint(projectDir = '.') {
  const root = resolve(projectDir);
  const warnings = [];
  const packageFile = join(root, 'package.json');
  const configFile = join(root, 'foundation.config.json');
  if (!existsSync(packageFile)) fail('package.json not found');
  if (!existsSync(configFile)) fail('foundation.config.json not found');
  const pkg = readJson(packageFile);
  const config = readJson(configFile);
  if (config.schemaVersion !== 1) fail(`Unsupported foundation.config.json schemaVersion: ${String(config.schemaVersion)}`);
  const profileName = config.profile?.name ?? pkg.foundation?.profile;
  const builtinProfile = profiles[profileName];
  if (!builtinProfile) fail(`Project Blueprint v1 migration only supports built-in profiles; found ${String(profileName)}`);
  if (config.profile?.source === 'custom') fail('Project Blueprint v1 migration cannot faithfully adopt a custom profile; convert it to a built-in profile first');

  const runtimeFile = join(root, 'public', 'runtime-config.json');
  const runtime = existsSync(runtimeFile) ? readJson(runtimeFile) : {};
  const packageName = requireString(pkg.name, 'package.json name');
  const fallbackId = packageName.startsWith('@') ? packageName.split('/')[1] : packageName;
  const id = readExistingAppId(root, fallbackId);
  if (!appIdPattern.test(id)) fail(`Could not infer a valid project id from src/app/application.ts: ${id}`);
  const title = typeof runtime.app?.name === 'string' && runtime.app.name.trim() ? runtime.app.name.trim() : packageName;
  const existingFoundationVersion = typeof config.foundationVersion === 'string' && semverPattern.test(config.foundationVersion) ? config.foundationVersion : undefined;
  const foundationVersion = existingFoundationVersion && minorLine(existingFoundationVersion) === minorLine(ownPackage.version)
    ? existingFoundationVersion
    : ownPackage.version;
  if (!existingFoundationVersion) warnings.push(`Could not infer a valid foundationVersion; migration targets ${ownPackage.version}`);
  else if (foundationVersion !== existingFoundationVersion) warnings.push(`Existing Foundation ${existingFoundationVersion} will be upgraded to ${ownPackage.version} when Project Blueprint compilation is adopted`);
  const shell = config.ui?.shell ?? pkg.foundation?.shell ?? 'sidebar';
  if (!shellIds.has(shell)) fail(`Existing project uses unsupported shell ${String(shell)}`);
  const router = runtime.router?.mode ?? 'browser';
  if (!['browser', 'hash'].includes(router)) fail(`Existing project uses unsupported router mode ${String(router)}`);
  const deployment = config.deployment ?? pkg.foundation?.deployment ?? 'none';
  if (!deployments[deployment]) fail(`Existing project uses unsupported deployment ${String(deployment)}`);
  const contract = config.contractMode ?? pkg.foundation?.contract ?? 'none';
  resolveContractMode(contract);

  const moduleRoot = join(root, 'src', 'modules');
  if (!existsSync(moduleRoot)) fail('src/modules not found');
  const pages = [];
  const resources = [];
  const navigationItems = [];
  const resourceCopies = [];
  let fallbackOrder = 0;
  for (const entry of readdirSync(moduleRoot).sort()) {
    const moduleDir = join(moduleRoot, entry);
    if (!statSync(moduleDir).isDirectory()) continue;
    const manifestFile = join(moduleDir, 'foundation.module.json');
    if (!existsSync(manifestFile)) {
      warnings.push(`Skipped module ${entry}: foundation.module.json is missing`);
      continue;
    }
    const manifest = readJson(manifestFile);
    if (manifest.schemaVersion !== 1 || typeof manifest.id !== 'string' || !slugPattern.test(manifest.id)) fail(`Module ${entry} cannot be migrated: invalid manifest id/schemaVersion`);
    if (!patterns[manifest.pattern]) fail(`Module ${entry} cannot be migrated: unknown pattern ${String(manifest.pattern)}`);
    const metadata = readRouteMetadata(moduleDir, manifest.id, fallbackOrder);
    fallbackOrder += 10;

    if (manifest.resource) {
      const specFile = join(moduleDir, manifest.resource.spec ?? 'foundation.resource.json');
      if (!existsSync(specFile)) fail(`Resource module ${entry} is missing ${String(manifest.resource.spec ?? 'foundation.resource.json')}`);
      const spec = normalizeResourceSpec(readJson(specFile));
      const source = `resources/${spec.id}.resource.json`;
      resources.push({ source });
      navigationItems.push({ target: spec.id, label: metadata.label, order: metadata.order });
      resourceCopies.push({ source, content: normalizedText(spec) });
      continue;
    }

    const route = manifest.route ?? {};
    if (route.index !== true && typeof route.path !== 'string') fail(`Module ${entry} cannot be migrated: manifest.route requires index=true or path`);
    pages.push({
      id: manifest.id,
      title: metadata.title,
      pattern: manifest.pattern,
      ...(route.index === true ? { index: true } : { route: route.path }),
      ...(metadata.permission ? { permission: metadata.permission } : {}),
      ...(Array.isArray(manifest.contracts) && manifest.contracts.length ? { contracts: [...manifest.contracts] } : {})
    });
    navigationItems.push({ target: manifest.id, label: metadata.label, order: metadata.order });
  }
  if (!pages.length) fail('No migratable page modules found');
  const indexCount = pages.filter((page) => page.index).length;
  if (indexCount !== 1) fail(`Existing project must expose exactly one index page before migration; found ${indexCount}`);

  const blueprint = {
    schemaVersion: 1,
    project: { id, packageName, title },
    foundation: { version: foundationVersion, profile: profileName, shell, router, deployment, contract },
    theme: readExistingTheme(root, warnings),
    navigation: { items: navigationItems.sort((a, b) => a.order - b.order || a.target.localeCompare(b.target)) },
    pages,
    resources
  };
  return { root, blueprint, resourceCopies, warnings };
}

export function initializeProjectBlueprint(projectDir = '.', options = {}) {
  const plan = planProjectBlueprint(projectDir);
  if (!options.write) return { ...plan, written: [] };
  const blueprintFile = join(plan.root, projectBlueprintFileName);
  if (existsSync(blueprintFile) && !options.force) fail(`${projectBlueprintFileName} already exists. Use --force to replace it.`);
  const writes = [];
  for (const resource of plan.resourceCopies) {
    const file = join(plan.root, resource.source);
    if (existsSync(file) && !options.force) {
      const current = readFileSync(file, 'utf8');
      if (current !== resource.content) fail(`${resource.source} already exists with different content. Use --force to replace it.`);
    }
  }
  for (const resource of plan.resourceCopies) {
    const file = join(plan.root, resource.source);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, resource.content, 'utf8');
    writes.push(resource.source);
  }
  writeFileSync(blueprintFile, normalizedText(plan.blueprint), 'utf8');
  writes.push(projectBlueprintFileName);
  return { ...plan, written: writes };
}

function parseCli(argv) {
  const args = [...argv];
  let command = args.shift();
  const options = { json: false, forceGenerated: false, write: false, force: false };
  if (command === '--help') { options.help = true; command = undefined; }
  const positional = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--force-generated') { options.forceGenerated = true; continue; }
    if (arg === '--write') { options.write = true; continue; }
    if (arg === '--force') { options.force = true; continue; }
    if (arg === '--help') { options.help = true; continue; }
    if (arg?.startsWith('--')) fail(`Unknown option ${arg}`);
    positional.push(arg);
  }
  return { command, positional, options };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { command, positional, options } = parseCli(process.argv.slice(2));
    if (options.help || !command) {
      console.log('Usage: foundation-project init [project-dir] [--write] [--force] [--json]\n       foundation-project validate [foundation.project.json] [--json]\n       foundation-project diagnose [foundation.project.json] [--json]\n       foundation-project compile [foundation.project.json] [--force-generated] [--json]\n       foundation-project status [project-dir] [--json]');
      process.exit(0);
    }
    if (command === 'init') {
      if (positional.length > 1) fail('init accepts at most one project directory');
      const result = initializeProjectBlueprint(positional[0] ?? '.', { write: options.write, force: options.force });
      if (options.json) console.log(JSON.stringify({ blueprint: result.blueprint, warnings: result.warnings, written: result.written }, null, 2));
      else {
        console.log(options.write ? `Initialized ${projectBlueprintFileName}` : `Project Blueprint migration plan for ${result.root}`);
        for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
        if (!options.write) console.log(JSON.stringify(result.blueprint, null, 2));
        else for (const file of result.written) console.log(`  ${file}`);
      }
    } else if (command === 'validate') {
      if (positional.length > 1) fail('validate accepts at most one Blueprint path');
      const loaded = loadProjectBlueprint(positional[0] ?? projectBlueprintFileName);
      const result = { valid: true, project: loaded.blueprint.project.id, projectSha256: loaded.projectHash, blueprint: loaded.blueprint };
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Project Blueprint valid: ${result.project} (${result.projectSha256})`);
    } else if (command === 'diagnose') {
      if (positional.length > 1) fail('diagnose accepts at most one Blueprint path');
      const result = diagnoseProjectBlueprint(positional[0] ?? projectBlueprintFileName);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else if (result.valid) console.log(`Project Blueprint diagnostics clean: ${result.project}`);
      else for (const diagnostic of result.diagnostics) console.error(`${diagnostic.code} [${diagnostic.source}]: ${diagnostic.message}`);
      if (!result.valid) process.exitCode = 1;
    } else if (command === 'compile') {
      if (positional.length > 1) fail('compile accepts at most one Blueprint path');
      const result = compileProjectBlueprint(positional[0] ?? projectBlueprintFileName, { forceGenerated: options.forceGenerated });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Compiled Project Blueprint ${result.project}`);
        console.log(`  generated-owned: ${result.generatedOwned}`);
        console.log(`  scaffold-once: ${result.scaffoldOnce}`);
        console.log(`  human-owned: ${result.humanOwned}`);
        console.log(`  written: ${result.written.length}, deleted: ${result.deleted.length}`);
      }
    } else if (command === 'status') {
      if (positional.length > 1) fail('status accepts at most one project directory');
      const result = inspectProjectBlueprintState(positional[0] ?? '.');
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Project Blueprint status: ${result.root}`);
        if (!result.managed) console.log('Project is not managed by Project Blueprint');
        for (const issue of result.issues) console.error(`ERROR: ${issue}`);
        for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
        if (result.managed && !result.issues.length && !result.warnings.length) console.log('Project Blueprint state is clean');
      }
      if (result.issues.length) process.exitCode = 1;
    } else {
      fail(`Unknown foundation-project command ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
