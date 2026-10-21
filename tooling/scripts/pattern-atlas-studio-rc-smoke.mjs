#!/usr/bin/env node
/** Production Studio editor trial package: checksum, SPA routing and real Chromium. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchChromiumCdp } from './chromium-cdp-start.mjs';

const directory = resolve(import.meta.dirname, '../../artifacts/pattern-atlas/studio-rc');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.status, 'candidate-unpromoted');
for (const file of manifest.files) {
  const bytes = readFileSync(join(directory, file.path));
  assert.equal(bytes.length, file.size, 'Candidate file size drift: ' + file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, 'Candidate SHA drift: ' + file.path);
}
const serverPort = 5398, debugPort = 9398;
const origin = 'http://127.0.0.1:' + serverPort;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, label, limit = 25000) {
  const start = Date.now(); let last;
  while (Date.now() - start < limit) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await pause(150);
  }
  throw new Error(label + ' timed out' + (last ? ': ' + String(last) : ''));
}
// On real Windows, launch the *shipped .cmd file*, not just the Node server.
const windows = process.platform === 'win32';
if (windows) {
  const launcher = join(directory, 'start-studio.cmd');
  assert(existsSync(launcher), 'Missing Windows trial launcher');
  assert.match(readFileSync(launcher, 'utf8'), /node serve\.mjs/, 'Windows launcher no longer starts Studio');
}
const server = spawn(windows ? (process.env.ComSpec || 'cmd.exe') : process.execPath,
  windows ? ['/d', '/c', 'start-studio.cmd'] : ['serve.mjs'],
  { cwd: directory, env: { ...process.env, ATLAS_STUDIO_PORT: String(serverPort) },
    stdio: 'inherit' });
const profile = mkdtempSync(join(tmpdir(), 'studio-rc-smoke-'));
let browser, socket, aasFixtureServer, aasBridge, p5Server;
try {
  await until(async () => (await fetch(origin + '/studio')).ok, 'candidate static server');
  for (const path of ['/create', '/studio']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, 'SPA route: ' + path);
    assert.match(await response.text(), /assets\//, 'Missing production HTML asset entry');
  }
  const js = manifest.files.find((file) => file.path.startsWith('site/assets/') && file.path.endsWith('.js'));
  assert(js, 'Missing compiled JavaScript');
  const asset = await fetch(origin + '/' + js.path.slice(5));
  assert.equal(asset.status, 200, 'Compiled asset missing');
  assert.match(asset.headers.get('content-type') || '', /javascript/);
  assert.equal((await fetch(origin + '/assets/not-real.js')).status, 404, 'Missing JS must be 404, not the SPA');
  browser = await launchChromiumCdp({
    executable: process.env.CHROMIUM_BIN || 'google-chrome',
    port: debugPort, profileRoot: profile
  });
  const tab = await fetch('http://127.0.0.1:' + debugPort + '/json/new?about:blank', { method: 'PUT' });
  assert.equal(tab.status, 200);
  const target = await tab.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', (event) => {
    const result = JSON.parse(String(event.data));
    if (result.method === 'Runtime.exceptionThrown')
      errors.push(result.params?.exceptionDetails?.text || 'Browser exception');
    const waiting = pending.get(result.id);
    if (waiting) {
      pending.delete(result.id); clearTimeout(waiting.timer);
      if (result.error) waiting.reject(new Error(result.error.message)); else waiting.resolve(result.result);
    }
  });
  function call(method, params = {}) {
    return new Promise((done, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP ' + method + ' timeout')); }, 10000);
      pending.set(id, { resolve: done, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: origin + '/create' });
  await until(() => evaluate("Boolean(document.querySelector('.pa-create') && document.body.textContent.includes('进入拖拽设计器'))"), 'production create page');
  await call('Page.navigate', { url: origin + '/studio' });
  await until(() => evaluate("Boolean(document.querySelector('.pa-studio-toolbar') && document.querySelector('.pa-studio-inspector-rail'))"), 'production Studio editor');

  // P0 in the actual packaged production editor, not a source-only unit test.
  const evidenceDir = resolve(import.meta.dirname, '../../artifacts/pattern-atlas/studio-p0-evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const accepted = [];
  const pass = (id) => accepted.push({ id, status: 'PASS' });

  // P1: assert keyboard and viewport behavior in the packaged production editor.
  const createAudit = { checks: [], viewports: [] };
  const createPass = (name) => { createAudit.checks.push(name); pass(name); };
  const key = async (keyName, code, keyCode) => {
    const params = { key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    // CDP Enter requires a char event to reproduce Chrome's trusted native button activation.
    // Verified against a standalone Chromium button: keyDown/keyUp alone does not click.
    if (code === 'Enter') {
      await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params });
      await call('Input.dispatchKeyEvent', { type: 'char', ...params, text: '\r', unmodifiedText: '\r' });
    } else {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    }
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  };
  const keyboardFocusOn = async (selector, label) => {
    for (let index = 0; index < 48; index++) {
      await key('Tab', 'Tab', 9);
      const focus = await evaluate("(() => { const e = document.activeElement; if (!e?.matches(" + JSON.stringify(selector) + ")) return null; const style = getComputedStyle(e); return { focusVisible: e.matches(':focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) }; })()");
      if (focus) {
        assert(focus.focusVisible, label + ' must be :focus-visible after real Tab');
        assert.notEqual(focus.outlineStyle, 'none', label + ' lacks outline style');
        assert(focus.outlineWidth >= 2, label + ' has insufficient outline width');
        return;
      }
    }
    throw new Error(label + ' not reachable via Tab');
  };
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: origin + '/create' });
  await until(() => evaluate("document.querySelectorAll('.pa-create-template').length === 3"), 'create templates ready');
  await keyboardFocusOn('.pa-create-advanced summary', 'advanced settings');
  await keyboardFocusOn('.pa-create-template', 'layout template');
  assert(await evaluate("document.activeElement?.textContent?.includes('空白页面')"), 'Expected first template focus');
  await key(' ', 'Space', 32);
  await until(() => evaluate("document.querySelector('.pa-create-template')?.getAttribute('aria-pressed') === 'true'"), 'Space chooses blank template');
  await key('Tab', 'Tab', 9);
  assert(await evaluate("document.activeElement?.matches('.pa-create-template') && document.activeElement.textContent?.includes('Bento')"), 'Bento must follow first template');
  await key('Enter', 'Enter', 13);
  await until(() => evaluate("[...document.querySelectorAll('.pa-create-template')].find(e=>e.textContent?.includes('Bento'))?.getAttribute('aria-pressed') === 'true'"), 'Enter chooses Bento');
  createPass('create-keyboard-focus-and-layout-selection');

  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.pa-create-template')).transitionDuration"), '0s', 'Reduced motion must disable template transitions');
  await call('Emulation.setEmulatedMedia', { features: [] });
  createPass('create-reduced-motion');

  for (const width of [320, 375, 768, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await until(() => evaluate("window.innerWidth === " + width), 'create width ' + width);
    const metrics = await evaluate("(() => {const root=document.documentElement;const form=document.querySelector('.pa-create');const cta=[...document.querySelectorAll('.pa-create-actions button')].find(b=>b.textContent?.includes('进入拖拽设计器'));const rect=cta?.getBoundingClientRect();const buttons=[...document.querySelectorAll('.pa-create-template')];return {viewport:innerWidth,documentScrollWidth:root.scrollWidth,createScrollWidth:form?.scrollWidth,createClientWidth:form?.clientWidth,templateCount:buttons.length,templateOverflow:buttons.some(b=>{const r=b.getBoundingClientRect();return r.right>innerWidth+2 || r.left< -2;}),ctaPresent:Boolean(cta),ctaOverflow:!rect||rect.width<120||rect.right>innerWidth+2||rect.left< -2};})()");
    // Save a screenshot and log offending DOM boxes before asserting, so
    // a failed responsive gate identifies its source instead of losing evidence.
    const overflowOrigins = await evaluate("(() => [...document.querySelectorAll('body *')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,cls:typeof e.className==='string'?e.className.slice(0,100):'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};}).filter(e=>e.width>0&&e.right>innerWidth+3).slice(0,20))()");
    console.log(JSON.stringify({ type: 'create-viewport', width, metrics, overflowOrigins }));
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    assert(shot.data, 'Create screenshot absent: ' + width);
    writeFileSync(join(evidenceDir, 'create-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    assert.equal(metrics.viewport, width, 'Viewport mismatch');
    assert(metrics.documentScrollWidth <= width + 2, 'Horizontal document overflow at ' + width + ': ' + JSON.stringify(metrics));
    assert(metrics.createScrollWidth <= metrics.createClientWidth + 2, 'Create form overflow at ' + width);
    assert.equal(metrics.templateCount, 3, 'Template count drift');
    assert.equal(metrics.templateOverflow, false, 'Template offscreen at ' + width);
    assert.equal(metrics.ctaOverflow, false, 'Primary action clipped at ' + width);
    createAudit.viewports.push(metrics);
  }
  await call('Emulation.clearDeviceMetricsOverride');
  createPass('create-multi-viewport-overflow-and-screenshots');
  writeFileSync(join(evidenceDir, 'create-ui-automated.json'), JSON.stringify({
    status: 'AUTOMATED_PASS', sourceCommit: manifest.sourceCommit, platform: process.platform,
    ...createAudit, limitations: [
      'No human visual acceptance; screenshots and DOM geometry are automated evidence',
      'No screen reader/browser accessibility-tree acceptance',
      'No product-owner signoff'
    ]
  }, null, 2) + '\n');

  const stored = () => evaluate("JSON.parse(localStorage.getItem('foundation-showcase:pattern-atlas:studio-v1') || 'null')");
  const countNodes = (node) => 1 + (node.children || []).reduce((n, x) => n + countNodes(x), 0);
  const projectName = 'Stable-P0-' + manifest.sourceCommit.slice(0, 8);
  await call('Page.navigate', { url: origin + '/create' });
  await until(() => evaluate("!!document.querySelector('#pa-builder-project-title')"), 'P0 project form');
  assert(await evaluate("(() => { const x=document.querySelector('#pa-builder-project-title'); x.focus(); x.select(); return true; })()"));
  await call('Input.insertText', { text: projectName });
  await until(() => evaluate("document.querySelector('#pa-builder-project-title')?.value === " + JSON.stringify(projectName)), 'P0 title input');
  assert(await evaluate("(() => {const x=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('进入拖拽设计器'));if(!x||x.disabled)return false;x.click();return true;})()"), 'P0 creation CTA');
  await until(() => evaluate("document.querySelector('.pa-studio h1')?.textContent === " + JSON.stringify(projectName)), 'P0 creation handoff');
  pass('create-project-and-handoff');

  // P2 production Studio Inspector keyboard/ARIA + page-level viewport regression.
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await until(() => evaluate("!!document.querySelector('.pa-studio-inspector-rail .pa-studio-rail-collapse')"), 'P2 inspector toolbar ready');
  assert(await evaluate("(() => { const b=document.querySelector('.pa-studio-rail-collapse');const p=document.querySelector('#pa-studio-inspector-content');return b?.getAttribute('aria-expanded')==='true' && b?.getAttribute('aria-controls')==='pa-studio-inspector-content' && p?.getAttribute('role')==='region'; })()"), 'Inspector must describe expanded controlled region');
  assert(await evaluate("(() => {const e=document.querySelector('.pa-studio-rail-collapse');e?.focus();return document.activeElement===e})()"), 'Inspector collapse button focus');
  await key('Tab', 'Tab', 9);
  assert(await evaluate("(() => {const e=document.activeElement;const s=getComputedStyle(e);return e?.matches('.pa-studio-inspector-rail button[title=\"页面\"]') && e.matches(':focus-visible') && s.outlineStyle!=='none' && parseFloat(s.outlineWidth)>=2;})()"), 'Inspector first category reachable with visible Tab focus');
  await key('Enter', 'Enter', 13);
  await until(() => evaluate("document.querySelector('.pa-studio-inspector-rail button[title=\"页面\"]')?.getAttribute('aria-pressed')==='true' && document.querySelector('#pa-studio-inspector-content')?.getAttribute('aria-label')==='当前属性分类：页面'"), 'Inspector page category keyboard selection');
  assert(await evaluate("(() => {const e=document.querySelector('.pa-studio-rail-collapse');e?.focus();return document.activeElement===e;})()"));
  await key('Enter', 'Enter', 13);
  await until(() => evaluate("document.querySelector('.pa-studio-rail-collapse')?.getAttribute('aria-expanded')==='false' && !document.querySelector('#pa-studio-inspector-content')"), 'Inspector keyboard collapse');
  await key('Enter', 'Enter', 13);
  await until(() => evaluate("document.querySelector('.pa-studio-rail-collapse')?.getAttribute('aria-expanded')==='true' && Boolean(document.querySelector('#pa-studio-inspector-content'))"), 'Inspector keyboard reexpand');
  const pageTabState = await evaluate("(() => {const tabs=[...document.querySelectorAll('.pa-studio-page-tabs button')];return {count:tabs.length,current:tabs.filter(x=>x.getAttribute('aria-current')==='page').length};})()");
  assert.equal(pageTabState.count, (await stored()).blueprint.pages.length, 'Page navigation count changed');
  assert.equal(pageTabState.current, 1, 'Exactly one studio page should be current');
  pass('studio-inspector-keyboard-and-aria');

  const inspectorViewports = [];
  for (const width of [320, 375, 768, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await until(() => evaluate("window.innerWidth === " + width), 'Studio Inspector viewport ' + width);
    const metrics = await evaluate("(() => {const rail=document.querySelector('.pa-studio-inspector-rail');const region=document.querySelector('#pa-studio-inspector-content');const panel=document.querySelector('.pa-studio-inspector-shell');const bounds=panel?.getBoundingClientRect();return {viewport:innerWidth,documentScrollWidth:document.documentElement.scrollWidth,inspectorAvailable:Boolean(region),railButtons:rail?.querySelectorAll('button').length,inspectorLeft:Math.round(bounds?.left ?? -1),inspectorRight:Math.round(bounds?.right ?? -1),inspectorWidth:Math.round(bounds?.width ?? -1)};})()");
    const offenders = await evaluate("(() => [...document.querySelectorAll('body *')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,cls:typeof e.className==='string'?e.className.slice(0,90):'',left:Math.round(r.left),right:Math.round(r.right)};}).filter(e=>e.right>innerWidth+3).slice(0,12))()");
    console.log(JSON.stringify({ type:'studio-inspector-viewport', width, metrics, offenders }));
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    assert(shot.data, 'Studio inspector screenshot absent: ' + width);
    writeFileSync(join(evidenceDir, 'studio-inspector-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    assert(metrics.documentScrollWidth <= width + 2, 'Studio horizontal overflow at ' + width + ': ' + JSON.stringify(metrics));
    assert(metrics.inspectorAvailable && metrics.railButtons >= 5 && metrics.inspectorWidth > 0, 'Inspector hidden at ' + width);
    assert(metrics.inspectorLeft >= -2 && metrics.inspectorRight <= width + 2, 'Inspector panel outside viewport at ' + width);
    inspectorViewports.push(metrics);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  writeFileSync(join(evidenceDir, 'studio-inspector-ui-automated.json'), JSON.stringify({
    status:'AUTOMATED_PASS', sourceCommit:manifest.sourceCommit, platform:process.platform,
    checks:['studio-inspector-keyboard-and-aria','studio-inspector-responsive-viewport'], viewports:inspectorViewports,
    limitations:['Automated geometry is not human visual acceptance','No screen reader testing or product owner signoff']
  }, null, 2) + '\n');
  pass('studio-inspector-responsive-viewport');


  // Two independent scroll regions: long palette never pushes the layer tools
  // out of view, and scrolling one list must not scroll the other.
  const sidebarLayout = await evaluate(`(() => {
    const sidebar=document.querySelector('.pa-studio-sidebar');
    const palette=sidebar?.querySelector('.pa-studio-palette');
    const layers=sidebar?.querySelector('.pa-studio-layers');
    const search=sidebar?.querySelector('input[aria-label="搜索页面图层"]');
    if (!sidebar||!palette||!layers||!search) return null;
    const s=sidebar.getBoundingClientRect(),p=palette.getBoundingClientRect(),
          l=layers.getBoundingClientRect(),q=search.getBoundingClientRect();
    const firstLayerTop=l.top,firstSearchTop=q.top;
    palette.scrollTop=palette.scrollHeight;
    return {paletteHeight:p.height,layersHeight:l.height,sidebarHeight:s.height,
      paletteOverflow:palette.scrollHeight>palette.clientHeight,
      sidebarOverflow:sidebar.scrollHeight>sidebar.clientHeight+3,
      paletteWithin:p.top>=s.top-2&&p.bottom<=s.bottom+2,
      layersWithin:l.top>=s.top-2&&l.bottom<=s.bottom+2,
      searchWithin:q.top>=s.top-2&&q.bottom<=s.bottom+2,
      layerPositionStable:Math.abs(layers.getBoundingClientRect().top-firstLayerTop)<2,
      searchPositionStable:Math.abs(search.getBoundingClientRect().top-firstSearchTop)<2};
  })()`);
  assert(sidebarLayout && sidebarLayout.paletteHeight>=90 && sidebarLayout.layersHeight>=100,
    'Studio palette and layers must each have their own usable vertical space: '+JSON.stringify(sidebarLayout));
  assert(sidebarLayout.paletteOverflow && !sidebarLayout.sidebarOverflow,
    'Long palette must scroll internally without scrolling the entire sidebar: '+JSON.stringify(sidebarLayout));
  assert(sidebarLayout.paletteWithin && sidebarLayout.layersWithin && sidebarLayout.searchWithin
    && sidebarLayout.layerPositionStable && sidebarLayout.searchPositionStable,
    'Palette scrolling must not hide layer search/tree: '+JSON.stringify(sidebarLayout));
  pass('studio-sidebar-independent-scroll-regions');

  // UX: exercise actual packaged Studio navigator, not only the pure tree helper.
  const initialLayers = await evaluate("document.querySelectorAll('.pa-studio-layers .pa-studio-layer-row').length");
  assert(initialLayers > 1, 'Studio must expose nested layers for navigator trial');
  assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-layer-tool-row button')].find(x=>x.textContent?.includes('折叠全部'));if(!b)return false;b.click();return true;})()"), 'Fold-all control missing');
  await until(() => evaluate("document.querySelectorAll('.pa-studio-layers .pa-studio-layer-row').length === 1"), 'UX fold all layers');
  // Force a short Layers viewport so an expanded descendant is outside view.
  // This must scroll the Layers pane, not the whole browser or component palette.
  const browserScrollBeforeLayerReveal = await evaluate(`(() => {
    const layers=document.querySelector('.pa-studio-layers');
    if (!layers) return null;
    layers.style.height='50px'; layers.style.maxHeight='50px'; layers.style.flex='0 0 50px';
    layers.scrollTop=0;return window.scrollY;
  })()`);
  assert(browserScrollBeforeLayerReveal !== null, 'Cannot size Layers pane for scroll regression');
  const selectedCanvasNode = await evaluate("(() => {const all=[...document.querySelectorAll('.pa-studio-device [data-studio-node]')];const candidate=all.findLast(n=>!n.querySelector('[data-studio-node]'));if(!candidate)return '';candidate.click();return candidate.getAttribute('data-studio-node')||'';})()");
  assert(selectedCanvasNode, 'Cannot select nested component on canvas');
  await until(() => evaluate("(() => {const selected=document.querySelector('.pa-studio-layers .pa-studio-layer.is-selected');return selected && selected.closest('.pa-studio-layer-row') && document.querySelectorAll('.pa-studio-layers .pa-studio-layer-row').length > 1;})()"), 'UX selected canvas node is hidden by folded parent');
  await until(() => evaluate(`(() => {
    const pane=document.querySelector('.pa-studio-layers');
    const row=pane?.querySelector('.pa-studio-layer.is-selected');
    if (!row || pane.scrollHeight <= pane.clientHeight || pane.scrollTop <= 0) return false;
    const a=pane.getBoundingClientRect(), b=row.getBoundingClientRect();
    return b.top >= a.top - 2 && b.bottom <= a.bottom + 2;
  })()`), 'UX selected row must scroll into independent Layers viewport');
  assert.equal(await evaluate('window.scrollY'), browserScrollBeforeLayerReveal,
    'Layers selection must not scroll the document');
  assert(await evaluate(`(() => {
    const pane=document.querySelector('.pa-studio-layers');
    pane.style.removeProperty('height');pane.style.removeProperty('max-height');pane.style.removeProperty('flex');
    return true;
  })()`), 'Cannot restore Layers pane after viewport test');
  pass('studio-layer-selection-scroll-without-document-movement');
  assert(await evaluate("(() => {const nav=document.querySelector('.pa-studio-selection-path');return Boolean(nav&&nav.querySelectorAll('button').length>1)})()"), 'Selected canvas node must expose parent breadcrumb');
  const findLayer = "input[aria-label='搜索页面图层']";
  assert(await evaluate("(() => {const e=document.querySelector(" + JSON.stringify(findLayer) + ");if(!e)return false;e.focus();return document.activeElement===e;})()"), 'Layer search is not keyboard focusable');
  await call('Input.insertText', { text: selectedCanvasNode });
  await until(() => evaluate("(() => {const e=document.querySelector(" + JSON.stringify(findLayer) + ");return e?.value === " + JSON.stringify(selectedCanvasNode) + " && Boolean(document.querySelector('.pa-studio-layers .pa-studio-layer.is-search-match'));})()"), 'UX selected layer search');
  assert(await evaluate("(() => {const e=document.querySelector(" + JSON.stringify(findLayer) + ");e.focus();e.select();return true;})()"));
  await call('Input.insertText', { text: '___STUDIO-UX-no-matching-component___' });
  await until(() => evaluate("document.querySelector('.pa-studio-layers')?.textContent?.includes('没有匹配的页面图层')"), 'UX unmatched layer search');
  assert(await evaluate("(() => {const e=document.querySelector(" + JSON.stringify(findLayer) + ");e.focus();e.select();return true;})()"));
  await key('Backspace', 'Backspace', 8);
  await until(() => evaluate("(() => {const e=document.querySelector(" + JSON.stringify(findLayer) + ");return e?.value === '' && document.querySelectorAll('.pa-studio-layers .pa-studio-layer-row').length > 1;})()"), 'UX clear layer search');
  pass('studio-layer-fold-canvas-reveal-and-search');
  // A canvas selection outside an active layer filter should release the stale
  // filter and reveal the selected node instead of silently hiding it.
  assert(await evaluate("(() => {const e=document.querySelector(" + JSON.stringify(findLayer) + ");e.focus();return true;})()"));
  await call('Input.insertText', { text: '__never_a_layer__' });
  await until(() => evaluate("document.querySelector('.pa-studio-layers')?.textContent?.includes('没有匹配的页面图层')"), 'UX create nonmatching layer filter');
  assert(await evaluate(`(() => {
    const node=[...document.querySelectorAll('.pa-studio-device [data-studio-node]')].find(n =>
      n.getAttribute('data-studio-node')===${JSON.stringify(selectedCanvasNode)});
    if (!node) return false;node.click();return true;
  })()`), 'Selected canvas node missing for filter reset');
  await until(() => evaluate("(() => {const input=document.querySelector(" + JSON.stringify(findLayer) + ");return input?.value === '' && Boolean(document.querySelector('.pa-studio-layers .pa-studio-layer.is-selected'));})()"), 'UX canvas selection must clear hiding layer filter');
  pass('studio-canvas-selection-clears-unmatched-filter');


  const before = await stored();
  assert(before?.blueprint?.pages?.[0]?.composition, 'P0 initial autosave absent');
  const originalCount = countNodes(before.blueprint.pages[0].composition);
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-palette-item')].find(x=>x.querySelector('strong')?.textContent?.trim()==='文字标题');if(!e)return false;e.click();return true;})()"), 'P0 text widget missing');
  await until(async () => {
    const saved = await stored();
    return saved?.blueprint?.pages?.[0]?.composition && countNodes(saved.blueprint.pages[0].composition) === originalCount + 1;
  }, 'P0 component insertion/autosave');
  pass('insert-component-and-autosave');

  // Keyboard shortcut works only when the active control is not a text editor.
  assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-toolbar-actions button')].find(x=>x.textContent?.includes('撤销'));if(!b)return false;b.focus();return document.activeElement===b;})()"), 'Undo toolbar cannot be focused');
  await call('Input.dispatchKeyEvent', { type:'rawKeyDown', key:'z', code:'KeyZ', windowsVirtualKeyCode:90, modifiers:2 });
  await call('Input.dispatchKeyEvent', { type:'keyUp', key:'z', code:'KeyZ', windowsVirtualKeyCode:90 });
  await until(async () => countNodes((await stored())?.blueprint?.pages?.[0]?.composition) === originalCount, 'Studio Ctrl+Z undo');
  await call('Input.dispatchKeyEvent', { type:'rawKeyDown', key:'Z', code:'KeyZ', windowsVirtualKeyCode:90, modifiers:10 });
  await call('Input.dispatchKeyEvent', { type:'keyUp', key:'Z', code:'KeyZ', windowsVirtualKeyCode:90 });
  await until(async () => countNodes((await stored())?.blueprint?.pages?.[0]?.composition) === originalCount + 1, 'Studio Ctrl+Shift+Z redo');
  pass('studio-keyboard-undo-redo');

  assert(await evaluate("(() => {const e=document.querySelector('.pa-studio-inspector-rail button[title=风格]');if(!e)return false;e.click();return true;})()"), 'P0 style tab');
  await until(() => evaluate("!![...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('项目名称'))?.querySelector('input')"), 'P0 style editor');
  const edited = projectName + '-Edited';
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('项目名称'))?.querySelector('input');if(!e)return false;e.focus();e.select();return true;})()"));
  await call('Input.insertText', { text: edited });
  await until(async () => (await stored())?.blueprint?.project?.title === edited, 'P0 inspector property persistence');
  pass('inspector-property-edit');

  // Capture the whole three-panel desktop UI, not the CDP default 800px viewport.
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [label, device] of [['手机', 'mobile'], ['平板', 'tablet'], ['桌面', 'desktop']]) {
    const expression = "(() => {const x=[...document.querySelectorAll('.pa-studio-toolbar .ant-segmented-item')].find(e=>e.textContent?.trim()===" + JSON.stringify(label) + ");if(!x)return false;x.click();return true;})()";
    assert(await evaluate(expression), 'P0 responsive control ' + label);
    await until(() => evaluate("!!document.querySelector('.pa-studio-device.device-" + device + "')"), 'P0 device ' + device);
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    assert(shot.data, 'P0 screenshot failed: ' + device);
    writeFileSync(join(evidenceDir, device + '.png'), Buffer.from(shot.data, 'base64'));
  }
  pass('responsive-preview-and-screenshots');

  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='体验');if(!e)return false;e.click();return true;})()"), 'P0 live button');
  await until(() => evaluate("document.querySelector('.pa-studio-stage-crumb')?.textContent?.includes('交互体验')"), 'P0 live switch');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='编辑');if(!e)return false;e.click();return true;})()"), 'P0 edit button');
  await until(() => evaluate("document.querySelector('.pa-studio-stage-crumb')?.textContent?.includes('自由编辑')"), 'P0 return edit');
  pass('live-edit-switch');

  const expected = await stored();
  assert.equal(expected.blueprint.project.title, edited);
  await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-head-actions button')].find(x=>x.textContent?.includes('导出页面代码'));if(!e)return false;e.click();return true;})()"), 'P0 download button');
  const zipPath = await until(() => {
    const matches = readdirSync(profile).filter(n => n.endsWith('-frontend.zip') && existsSync(join(profile, n)));
    return matches.length ? join(profile, matches[0]) : null;
  }, 'P0 exported ZIP download');
  function storedZipEntry(bytes, target) {
    for (let pos = 0; pos + 30 < bytes.length;) {
      if (bytes.readUInt32LE(pos) !== 0x04034b50) break;
      const method = bytes.readUInt16LE(pos + 8), length = bytes.readUInt32LE(pos + 18);
      const nameLength = bytes.readUInt16LE(pos + 26), extraLength = bytes.readUInt16LE(pos + 28);
      const name = bytes.subarray(pos + 30, pos + 30 + nameLength).toString('utf8');
      const offset = pos + 30 + nameLength + extraLength;
      if (name === target) {
        assert.equal(method, 0, 'P0 ZIP compression changed');
        return bytes.subarray(offset, offset + length).toString('utf8');
      }
      pos = offset + length;
    }
    throw new Error('P0 ZIP missing ' + target);
  }
  const zip = readFileSync(zipPath);
  const studioJson = storedZipEntry(zip, 'atlas.studio.json');
  assert.deepEqual(JSON.parse(studioJson), expected, 'P0 ZIP Studio document lost edits');
  assert.deepEqual(JSON.parse(storedZipEntry(zip, 'foundation.project.json')), expected.blueprint, 'P0 Blueprint export mismatch');
  pass('real-browser-zip-download-and-blueprint');

  const inputFile = join(profile, 'P0-roundtrip.studio.json');
  writeFileSync(inputFile, studioJson);
  assert(await evaluate("(() => { localStorage.clear();sessionStorage.clear();return true; })()"));
  await call('Page.navigate', { url: origin + '/studio' });
  await until(() => evaluate("!!document.querySelector('.pa-studio-head-actions input[type=file]')"), 'P0 clean editor');
  assert.notEqual(await evaluate("document.querySelector('.pa-studio h1')?.textContent"), edited, 'P0 cache was not cleared');
  await call('DOM.enable');
  const dom = await call('DOM.getDocument');
  const selected = await call('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[aria-label="打开项目文件"]' });
  assert(selected.nodeId, 'P0 import input missing');
  await call('DOM.setFileInputFiles', { nodeId: selected.nodeId, files: [inputFile] });
  await until(() => evaluate("document.querySelector('.pa-studio h1')?.textContent === " + JSON.stringify(edited)), 'P0 reimport');
  await until(async () => JSON.stringify(await stored()) === JSON.stringify(expected), 'P0 import semantic parity');
  pass('clear-storage-and-exact-studio-reimport');

  // Cross-app browser contract path: production Studio -> Python bridge ->
  // actual HTTP server implementing AAS model API SHAPE (synthetic, not user source).
  // The separately tested user-supplied native AAS+SQLite is NOT shipped in CI.
  let nativeListCalls = 0;
  const aasRows = [
    { id: 10, model_name: 'AAS-CI-Model-10', status: 'published', algorithm: 'dummy_detector', experiment_id: 'p0_case_10' },
    { id: 11, model_name: 'AAS-CI-Model-11', status: 'draft', algorithm: 'dummy_detector', experiment_id: 'p0_case_11' },
    { id: 12, model_name: 'AAS-CI-Model-12', status: 'published', algorithm: 'dummy_detector', experiment_id: 'p0_case_12' }
  ];
  aasFixtureServer = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method !== 'GET' || path !== '/api/models') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"error":"No such native fixture"}');
      return;
    }
    nativeListCalls++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ models: aasRows, total: aasRows.length }));
  });
  await new Promise((done) => aasFixtureServer.listen(0, '127.0.0.1', done));
  const aasPort = aasFixtureServer.address().port;
  const bridgePort = 5498;
  const bridgeOrigin = 'http://127.0.0.1:' + bridgePort;
  const python = process.platform === 'win32' ? 'python' : 'python3';
  aasBridge = spawn(python, [
    'tooling/scripts/aas_p0/bridge.py', '--upstream', 'http://127.0.0.1:' + aasPort + '/',
    '--origin', origin + '/', '--port', String(bridgePort)
  ], { cwd: resolve(import.meta.dirname, '../..'), stdio: 'ignore' });
  let aasBridgeStartupError;
  aasBridge.on('error', (error) => { aasBridgeStartupError = error; });
  await until(async () => {
    if (aasBridgeStartupError) throw aasBridgeStartupError;
    if (aasBridge.exitCode !== null) throw new Error('Python AAS fixture bridge exited early');
    const response = await fetch(bridgeOrigin + '/api/records?page=1&pageSize=3');
    return response.status === 200;
  }, 'Python bridge for actual browser');

  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-palette-item')].find(x=>x.querySelector('strong')?.textContent?.includes('数据表格'));if(!e)return false;e.click();return true;})()"), 'P0 table palette action');
  await until(async () => {
    const saved = await stored();
    return Object.values(saved?.decorations ?? {}).some((value) => value?.widgetKind === 'table');
  }, 'P0 table component inserted');
  assert(await evaluate("(() => {const b=document.querySelector('.pa-studio-inspector-rail button[title=内容]');if(!b)return false;if(b.getAttribute('aria-pressed')!=='true')b.click();return true;})()"), 'P0 table content Inspector');
  await until(() => evaluate("!![...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('数据 GET 地址'))?.querySelector('input')"), 'P0 table GET address control');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('数据 GET 地址'))?.querySelector('input');if(!e)return false;e.focus();e.select();return true;})()"));
  await call('Input.insertText', { text: bridgeOrigin + '/api/records' });
  await until(async () => Object.values((await stored())?.decorations ?? {}).some((value) => value?.widgetProps?.dataUrl === bridgeOrigin + '/api/records'), 'P0 table bridge URL saved');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='体验');if(!e)return false;e.click();return true;})()"), 'P0 AAS-shaped bridge live mode');
  await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('AAS-CI-Model-10')"), 'AAS-shaped native HTTP through bridge -> production Studio UI');
  assert(nativeListCalls > 0, 'Production Studio did not cause any native AAS-shaped HTTP call');
  const aasShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(evidenceDir, 'aas-shaped-http-integration.png'), Buffer.from(aasShot.data, 'base64'));
  writeFileSync(join(evidenceDir, 'aas-shaped-http-integration.json'), JSON.stringify({
    status: 'SYNTHETIC_NATIVE_SHAPE_BROWSER_PASS', platform: process.platform,
    sourceCommit: manifest.sourceCommit, nativeListCalls,
    chain: ['production Chromium Studio /studio', 'Python stdlib AAS P0 bridge', 'synthetic native AAS-shaped HTTP fixture'],
    limitations: ['Native user-supplied AAS source is not in GitHub CI', 'No AAS authentication, CAS/ETag or production user signoff']
  }, null, 2) + '\n');
  pass('production-Studio-Python-bridge-AAS-shaped-HTTP');

  // P3 production Modal/Drawer: deterministic, synthetic HTTP 503. Never contact
  // an external backend, and never treat an unknown POST result as safe to retry.
  const prepareOverlay = async (kind, paletteName, endpoint) => {
    const edit = await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='编辑');if(!e)return false;e.click();return true;})()");
    assert(edit, 'P3 edit mode control');
    const added = await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-palette-item')].find(x=>x.querySelector('strong')?.textContent?.trim()===" + JSON.stringify(paletteName) + ");if(!e)return false;e.click();return true;})()");
    assert(added, 'P3 '+kind+' palette entry');
    await until(async () => Object.values((await stored())?.decorations ?? {}).some(x=>x.widgetKind===kind), 'P3 '+kind+' inserted');
    assert(await evaluate("(() => {const b=document.querySelector('.pa-studio-inspector-rail button[title=内容]');if(!b)return false;if(b.getAttribute('aria-pressed')!=='true')b.click();return true;})()"), 'P3 content inspector');
    await until(() => evaluate("!![...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('弹窗表单字段'))?.querySelector('textarea')"), 'P3 '+kind+' fields editor');
    assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('弹窗表单字段'))?.querySelector('textarea');if(!e)return false;e.focus();e.select();return true;})()"), 'P3 form fields focus');
    await call('Input.insertText', { text: 'title|标题|text|required' });
    await until(async () => Object.values((await stored())?.decorations ?? {}).some(x=>x.widgetKind===kind && x.widgetProps?.formFields==='title|标题|text|required'), 'P3 '+kind+' form declared');
    assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('表单提交 POST 地址'))?.querySelector('input');if(!e)return false;e.focus();e.select();return true;})()"), 'P3 submit URL editor');
    await call('Input.insertText', { text: endpoint });
    await until(async () => Object.values((await stored())?.decorations ?? {}).some(x=>x.widgetKind===kind && x.widgetProps?.submitUrl===endpoint), 'P3 '+kind+' URL persisted');
    assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='体验');if(!e)return false;e.click();return true;})()"), 'P3 live mode');
    await until(() => evaluate("[...document.querySelectorAll('.pa-studio-overlay > button')].some(x=>x.textContent?.includes(" + JSON.stringify(kind==='modal'?'打开弹窗':'查看详情') + "))"), 'P3 '+kind+' trigger ready');
  };
  const verifyOverlay = async (kind, triggerText, endpoint) => {
    const panel = kind==='modal' ? '.ant-modal' : '.ant-drawer';
    const footer = kind==='modal' ? '.ant-modal-footer' : '.ant-drawer-footer';
    const opened = await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-overlay > button')].find(x=>x.textContent?.includes(" + JSON.stringify(triggerText) + "));if(!b||b.disabled)return false;b.click();return true;})()");
    assert(opened, 'P3 '+kind+' trigger enabled');
    await until(() => evaluate("!!document.querySelector(" + JSON.stringify(panel+" input[aria-label='标题']") + ")"), 'P3 '+kind+' form visible');
    assert(await evaluate("(() => {const e=document.querySelector(" + JSON.stringify(footer+" .ant-btn-primary") + ");if(!e)return false;e.click();return true;})()"), 'P3 '+kind+' invalid submit');
    await until(() => evaluate("(() => {const e=document.querySelector(" + JSON.stringify(panel+" input[aria-label='标题']") + ");return e?.getAttribute('aria-invalid')==='true' && e?.getAttribute('aria-describedby') && document.activeElement===e && document.getElementById(e.getAttribute('aria-describedby'))?.getAttribute('role')==='alert';})()"), 'P3 '+kind+' field invalid ARIA/focus');
    assert(await evaluate("(() => {const e=document.querySelector(" + JSON.stringify(panel+" input[aria-label='标题']") + ");e?.focus();return document.activeElement===e;})()"));
    await call('Input.insertText', { text: 'P3 safe write' });
    await until(() => evaluate("document.querySelector(" + JSON.stringify(panel+" input[aria-label='标题']") + ")?.getAttribute('aria-invalid')==='false'"), 'P3 '+kind+' corrected field clears ARIA');
    let pausedCount=0;
    const interceptionErrors=[];
    const onIntercept=(event)=>{
      const msg=JSON.parse(String(event.data));
      if(msg.method!=='Fetch.requestPaused') return;
      pausedCount++;
      void call('Fetch.fulfillRequest',{
        requestId:msg.params.requestId,responseCode:503,
        responseHeaders:[{name:'Content-Type',value:'application/json'}],
        body:Buffer.from('{"error":"synthetic uncertain outcome"}').toString('base64')
      }).catch(x=>interceptionErrors.push(String(x)));
    };
    socket.addEventListener('message',onIntercept);
    try {
      await call('Fetch.enable',{patterns:[{urlPattern:origin+endpoint,requestStage:'Request'}]});
      assert(await evaluate("(() => {const b=document.querySelector(" + JSON.stringify(footer+" .ant-btn-primary") + ");if(!b||b.disabled)return false;b.click();return true;})()"), 'P3 '+kind+' first POST');
      await until(() => evaluate("(() => {const p=document.querySelector(" + JSON.stringify(panel) + ");return p?.textContent?.includes('写入结果不确定') && p.textContent.includes('禁止重复提交') && document.querySelector(" + JSON.stringify(footer+" .ant-btn-primary") + ")?.disabled;})()"),'P3 '+kind+' uncertain lock');
      assert.equal(pausedCount,1,'P3 '+kind+' expected exactly one intercepted POST');
      assert(await evaluate("(() => {const b=document.querySelector(" + JSON.stringify(footer+" .ant-btn-primary") + ");if(!b)return false;b.click();return b.disabled;})()"),'P3 '+kind+' submit must remain disabled');
      await pause(250);
      assert.equal(pausedCount,1,'P3 '+kind+' must not repeat uncertain POST');
      assert.deepEqual(interceptionErrors,[],'P3 synthetic interceptor');
    } finally {
      await call('Fetch.disable');
      socket.removeEventListener('message',onIntercept);
    }
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    writeFileSync(join(evidenceDir,'overlay-'+kind+'-uncertain.png'),Buffer.from(shot.data,'base64'));
    const closeResult=await evaluate("(() => {const input=document.querySelector(" + JSON.stringify(panel+" input[aria-label='标题']") + ");const root=input?.closest(" + JSON.stringify(panel) + ");const buttons=[...root?.querySelectorAll('button')??[]];const descriptions=buttons.map(b=>({text:b.textContent?.trim().slice(0,70),label:b.getAttribute('aria-label'),disabled:b.disabled}));const cancel=buttons.find(b=>/取消|Cancel/i.test(b.textContent||''))??root?.querySelector('.ant-modal-close,.ant-drawer-close');if(cancel)cancel.click();return {clicked:!!cancel,buttons:descriptions};})()");
    console.log(JSON.stringify({type:'P3-overlay-close',kind,closeResult}));
    assert(closeResult.clicked,'P3 '+kind+' session closed after unknown result');
    await pause(350);
  };
  await prepareOverlay('modal','模态弹窗','/api/p3-uncertain-modal');
  await verifyOverlay('modal','打开弹窗','/api/p3-uncertain-modal');
  pass('overlay-modal-field-focus-and-uncertain-post-lock');
  await prepareOverlay('drawer','侧边抽屉','/api/p3-uncertain-drawer');
  await verifyOverlay('drawer','查看详情','/api/p3-uncertain-drawer');
  pass('overlay-drawer-field-focus-and-uncertain-post-lock');

  // P4: real Ant Design remote-table DELETE interaction on a synthetic bridge
  // dataset. CDP fulfills DELETE only, not GET, so table/list reconciliation
  // remains the existing local fixture. No external business service contacted.
  const tableDecoration = Object.entries((await stored())?.decorations ?? {})
    .find(([, value]) => value?.widgetKind === 'table');
  assert(tableDecoration, 'P4 existing server-backed table missing');
  const tableNodeId = tableDecoration[0].split(':').at(-1);
  assert(tableNodeId, 'P4 table node ID missing');
  assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='编辑');if(!b)return false;b.click();return true;})()"), 'P4 edit mode');
  assert(await evaluate("(() => {const el=document.querySelector('[data-studio-node=' + " + JSON.stringify(JSON.stringify(tableNodeId)) + " + ']');if(!el)return false;el.click();return true;})()"), 'P4 select actual table component');
  await until(() => evaluate("!![...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('行删除 DELETE 地址'))?.querySelector('input')"), 'P4 delete URL Inspector');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-setting')].find(x=>x.textContent?.includes('行删除 DELETE 地址'))?.querySelector('input');if(!e)return false;e.focus();e.select();return true;})()"), 'P4 focus delete URL');
  await call('Input.insertText', { text: '/api/p4-delete/{id}' });
  await until(async () => Object.values((await stored())?.decorations ?? {}).some(x=>x.widgetKind==='table' && x.widgetProps?.deleteUrl==='/api/p4-delete/{id}'), 'P4 configured delete endpoint');
  assert(await evaluate("(() => {const e=[...document.querySelectorAll('.pa-studio-toolbar label')].find(x=>x.textContent?.trim()==='体验');if(!e)return false;e.click();return true;})()"), 'P4 live mode');
  await until(() => evaluate("(() => {const r=document.querySelector('.pa-studio-remote-table[data-atlas-table-source=remote]');return r?.textContent?.includes('AAS-CI-Model-10') && [...r.querySelectorAll('tbody tr')].filter(x=>x.textContent?.includes('AAS-CI-Model-')).length===3 && [...r.querySelectorAll('tbody tr button')].some(x=>x.textContent?.replace(/\\s/g,'')==='删除');})()"), 'P4 visible three server-backed fixture rows');
  const p4Rows = await evaluate("(() => {const r=document.querySelector('.pa-studio-remote-table');return {source:r?.getAttribute('data-atlas-table-source'),rows:[...r?.querySelectorAll('tbody tr')??[]].map(x=>({key:x.getAttribute('data-row-key'),text:x.textContent?.slice(0,100)}))};})()");
  console.log(JSON.stringify({type:'P4-live-table-fixture',p4Rows}));

  const deleteAttempts = [];
  let deleteMode = 'single';
  const p4InterceptErrors = [];
  const p4Intercept = (event) => {
    const data = JSON.parse(String(event.data));
    if (data.method !== 'Fetch.requestPaused') return;
    const req = data.params;
    const id = new URL(req.request.url).pathname.split('/').at(-1);
    deleteAttempts.push({ method: req.request.method, id });
    const responseCode = deleteMode === 'single' || id === '11' ? 503 : 200;
    void call('Fetch.fulfillRequest', { requestId: req.requestId, responseCode,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify({ status: responseCode })).toString('base64')
    }).catch((error) => p4InterceptErrors.push(String(error)));
  };
  const clickRowDelete = async (id) => {
    assert(await evaluate("(() => {const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(x=>x.textContent?.includes(" + JSON.stringify('AAS-CI-Model-'+id) + "));const b=[...row?.querySelectorAll('button')??[]].find(x=>x.textContent?.replace(/\\s/g,'')==='删除');if(!b||b.disabled)return false;b.click();return true;})()"),'P4 open single DELETE confirmation '+id);
    await until(() => evaluate("[...document.querySelectorAll('.ant-popconfirm-buttons button')].some(x=>x.textContent?.replace(/\\s/g,'').includes('确认删除'))"),'P4 single delete confirmation');
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(x=>x.textContent?.replace(/\\s/g,'').includes('确认删除'));if(!b)return false;b.click();return true;})()"),'P4 confirm single DELETE');
  };
  const acknowledgeDelete = async () => {
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(x=>x.textContent?.replace(/\\s/g,'').includes('已核对服务端，解除删除锁定'));if(!b)return false;b.click();return true;})()"), 'P4 explicit review acknowledgement button');
    await until(() => evaluate("[...document.querySelectorAll('.ant-popconfirm-buttons button')].some(x=>x.textContent?.replace(/\\s/g,'').includes('已核对，解除锁定'))"), 'P4 review confirmation');
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(x=>x.textContent?.replace(/\\s/g,'').includes('已核对，解除锁定'));if(!b)return false;b.click();return true;})()"),'P4 review unlock confirmation');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.getAttribute('data-atlas-delete-locked')==='false'"),'P4 delete lock cleared after review');
  };
  socket.addEventListener('message', p4Intercept);
  try {
    await call('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/p4-delete/*', requestStage: 'Request' }] });
    await clickRowDelete('10');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.getAttribute('data-atlas-delete-locked')==='true'"), 'P4 single uncertain DELETE lock');
    assert.equal(deleteAttempts.length, 1, 'P4 first single DELETE attempt count');
    assert.equal(deleteAttempts[0].id, '10');
    assert(await evaluate("(() => {const root=document.querySelector('.pa-studio-remote-table');return root?.textContent?.includes('删除操作已锁定') && root.textContent.includes('10') && [...root.querySelectorAll('button')].filter(x=>x.textContent?.replace(/\\s/g,'')==='删除').every(x=>x.disabled);})()"), 'P4 single unknown lock disables all row DELETEs');
    await until(() => evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(x=>x.textContent?.replace(/\\s/g,'')==='刷新');return Boolean(b && !b.disabled);})()"), 'P4 refresh available after 503');
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(x=>x.textContent?.replace(/\\s/g,'')==='刷新');if(!b||b.disabled)return false;b.click();return true;})()"),'P4 refresh while locked');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.getAttribute('data-atlas-delete-locked')==='true' && !document.querySelector('.pa-studio-remote-table .ant-table-wrapper .ant-spin-spinning')"), 'P4 lock survives server refresh');
    assert.equal(deleteAttempts.length,1,'P4 refresh must never retry DELETE');
    await acknowledgeDelete();
    assert.equal(deleteAttempts.length,1,'P4 acknowledgement does not send DELETE');
    pass('table-single-delete-uncertain-lock-and-review');

    deleteMode = 'batch';
    deleteAttempts.length = 0;
    await until(() => evaluate("[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].filter(x=>x.textContent?.includes('AAS-CI-Model-')).length===3"), 'P4 batch fixture ready');
    // On slower Chromium/Windows, synchronous .click() calls can observe stale
    // React selection state. Select by authoritative visible row in separate
    // CDP evaluation turns, awaiting each committed selection count.
    for (const [index, id] of ['10', '11', '12'].entries()) {
      const name = 'AAS-CI-Model-' + id;
      const ready = "(() => {const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(x=>x.textContent?.includes(" + JSON.stringify(name) + "));const input=row?.querySelector('input[type=checkbox]');return Boolean(input && !input.disabled && !input.checked && !document.querySelector('.pa-studio-remote-table .ant-spin-spinning'));})()";
      await until(() => evaluate(ready), 'P4 bulk checkbox ready ' + id);
      assert(await evaluate("(() => {const row=[...document.querySelectorAll('.pa-studio-remote-table tbody tr')].find(x=>x.textContent?.includes(" + JSON.stringify(name) + "));const input=row?.querySelector('input[type=checkbox]');if(!input||input.disabled||input.checked)return false;input.click();return true;})()"), 'P4 select checkbox '+id);
      await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('当前页已选择 " + String(index + 1) + " 条')"), 'P4 selected count after checkbox '+id);
    }
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(x=>x.textContent?.replace(/\\s/g,'')==='批量删除');if(!b||b.disabled)return false;b.click();return true;})()"),'P4 bulk confirmation opened');
    await until(() => evaluate("[...document.querySelectorAll('.ant-popconfirm-buttons button')].some(x=>x.textContent?.replace(/\\s/g,'').includes('确认批量删除'))"), 'P4 bulk confirmation');
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.ant-popconfirm-buttons button')].find(x=>x.textContent?.replace(/\\s/g,'').includes('确认批量删除'));if(!b)return false;b.click();return true;})()"),'P4 bulk DELETE confirmed');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.getAttribute('data-atlas-delete-locked')==='true'"), 'P4 batch partial result locks future delete');
    await until(() => evaluate("document.querySelector('.pa-studio-remote-table')?.textContent?.includes('未执行 1 条')"), 'P4 batch outcomes surfaced');
    assert.deepEqual(deleteAttempts.map(x=>x.id), ['10','11'], 'P4 batch must stop before 12 after unknown 11');
    assert(await evaluate("(() => {const r=document.querySelector('.pa-studio-remote-table');return r?.textContent?.includes('成功 1 条') && r.textContent.includes('结果不确定 1 条') && r.textContent.includes('未执行 1 条');})()"), 'P4 partial success, unknown and skipped counted separately');
    assert(await evaluate("(() => {const b=[...document.querySelectorAll('.pa-studio-remote-table button')].find(x=>x.textContent?.replace(/\\s/g,'')==='清空选择');if(!b)return false;b.click();return true;})()"), 'P4 clear selection while locked');
    assert(await evaluate("(() => {const r=document.querySelector('.pa-studio-remote-table');return r?.getAttribute('data-atlas-delete-locked')==='true' && r.textContent.includes('未执行 1 条');})()"), 'P4 clearing selection must not erase unknown outcome');
    assert.deepEqual(deleteAttempts.map(x=>x.id), ['10','11'], 'P4 no repeat after selection clear');
    assert.deepEqual(p4InterceptErrors,[],'P4 intercept errors');
    const screenshot=await call('Page.captureScreenshot', { format:'png',captureBeyondViewport:false });
    writeFileSync(join(evidenceDir,'table-delete-p4-uncertain.png'),Buffer.from(screenshot.data,'base64'));
    writeFileSync(join(evidenceDir,'table-delete-p4-automated.json'),JSON.stringify({
      status:'SYNTHETIC_BROWSER_PASS',sourceCommit:manifest.sourceCommit,platform:process.platform,
      single503:'10 locked until explicit acknowledgement',
      batch:{successful:['10'], uncertain:['11'], skipped:['12'], attempts:deleteAttempts},
      limitations:['Only synthetic DELETE interception with local list fixture',
        'No real backend transaction verification or inter-session idempotency']
    },null,2)+'\n');
    pass('table-bulk-partial-success-stops-and-persists-uncertainty');
  } finally {
    await call('Fetch.disable');
    socket.removeEventListener('message',p4Intercept);
  }

  writeFileSync(join(evidenceDir,'overlay-p3-automated.json'),JSON.stringify({
    status:'SYNTHETIC_BROWSER_PASS',sourceCommit:manifest.sourceCommit,platform:process.platform,
    scenarios:['modal','drawer'],responses:[503],
    contract:'Field errors focus/ARIA and uncertain POST blocked in one dialog session',
    limitations:['Synthetic HTTP interception only; no production database or server idempotency proof',
      'No human screen-reader validation or backend reinspection after reopening']
  },null,2)+'\n');


  // P5-R2b2: real production Chromium + native-model SQLite/HTTP sandbox.
  // The gateway commits the first PATCH and deliberately replies HTTP 503.
  // After a browser reload, the UI must query the SAME receipt key and clear
  // its journal without submitting another PATCH. No real user DB or tokens.
  const p5Origin = 'http://127.0.0.1:5499';
  const p5Writer = 'p5-browser-fixture-' + 'x'.repeat(40);
  p5Server = spawn(python, [
    'tooling/scripts/aas_p0/p5_browser_fixture.py',
    '--origin', origin + '/', '--port', '5499'
  ], { cwd: resolve(import.meta.dirname, '../..'), stdio: 'ignore' });
  let p5StartupError;
  p5Server.on('error', (error) => { p5StartupError = error; });
  await until(async () => {
    if (p5StartupError) throw p5StartupError;
    if (p5Server.exitCode !== null) throw new Error('P5 native fixture exited early');
    return (await fetch(p5Origin + '/__p5_test_counts')).ok;
  }, 'Native P5 SQLite fixture ready');
  await call('Page.navigate', { url: origin + '/studio' });
  await until(() => evaluate("!!document.querySelector('.pa-studio-inspector-rail button[title=\"接口管理\"]')"), 'P5 Studio editor loaded');
  const openP5Panel = async () => {
    assert(await evaluate("(() => {const b=document.querySelector('.pa-studio-inspector-rail button[title=\"接口管理\"]');if(!b)return false;if(b.getAttribute('aria-pressed')!=='true')b.click();return true;})()"), 'P5 interface manager');
    await until(() => evaluate("!!document.querySelector('[data-testid=\"p5-aas-recovery\"]')"), 'P5 sandbox panel');
    assert(await evaluate("(() => {const b=document.querySelector('button[aria-label=\"允许 AAS 合成模型测试\"]');if(!b)return false;if(b.getAttribute('aria-checked')!=='true')b.click();return true;})()"), 'P5 operator opt in');
  };
  const fillP5Writer = async () => {
    assert(await evaluate("(() => {const e=document.querySelector('input[aria-label=\"P5 临时写 Token\"]');if(!e)return false;e.focus();e.select();return true;})()"), 'P5 token input');
    await call('Input.insertText', { text: p5Writer });
    await until(() => evaluate("document.querySelector('input[aria-label=\"P5 临时写 Token\"]')?.value.length >= 32"), 'P5 transient token entered');
    assert.equal(await evaluate("localStorage.getItem('pattern-atlas:p5-native-synthetic-pending:v1')?.includes('p5-browser-fixture-') ?? false"), false, 'No fixture bearer token may be stored');
  };
  await openP5Panel();
  await until(() => evaluate("!!document.querySelector('[data-testid=\"p5-idle\"]')"), 'P5 initially idle');
  await fillP5Writer();
  assert(await evaluate("(() => {const b=document.querySelector('[data-testid=\"p5-submit\"]');if(!b||b.disabled)return false;b.click();return true;})()"), 'P5 one-shot submit');
  await until(() => evaluate("!![...document.querySelectorAll('.ant-popconfirm button')].find(b=>b.textContent?.includes('确认测试写入'))"), 'P5 write confirmation');
  assert(await evaluate("(() => {const b=[...document.querySelectorAll('.ant-popconfirm button')].find(b=>b.textContent?.includes('确认测试写入'));if(!b)return false;b.click();return true;})()"), 'P5 confirm synthetic write');
  await until(() => evaluate("!!document.querySelector('[data-testid=\"p5-pending\"]') && document.querySelector('[data-testid=\"p5-result\"]')?.textContent?.includes('结果仍不确定')"), 'P5 committed-but-503 pending');
  const storedP5 = await evaluate("JSON.parse(localStorage.getItem('pattern-atlas:p5-native-synthetic-pending:v1'))");
  assert.equal(storedP5.recordId, 1);
  assert.equal(storedP5.status, 'evaluated');
  assert.equal(storedP5.origin, p5Origin);
  assert(!JSON.stringify(storedP5).includes(p5Writer), 'P5 writer token leaked to journal');
  let nativeCounts = await (await fetch(p5Origin + '/__p5_test_counts')).json();
  assert.deepEqual(nativeCounts, { evaluationCount: 1, receiptCount: 1, faultConsumed: true }, 'P5 SQLite commit/receipt mismatch');
  const p5UncertainShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(evidenceDir, 'p5-native-commit-503-pending.png'), Buffer.from(p5UncertainShot.data, 'base64'));
  // Reload the real app; no active React component state or writer token survives.
  await call('Page.navigate', { url: origin + '/studio' });
  await until(() => evaluate("!!document.querySelector('.pa-studio-inspector-rail button[title=\"接口管理\"]')"), 'P5 reload real editor');
  await openP5Panel();
  await until(() => evaluate("!!document.querySelector('[data-testid=\"p5-pending\"]')"), 'P5 cross-session pending restored');
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"P5 临时写 Token\"]')?.value"), '', 'P5 token cannot survive reload');
  await fillP5Writer();
  assert(await evaluate("(() => {const b=document.querySelector('[data-testid=\"p5-query\"]');if(!b||b.disabled)return false;b.click();return true;})()"), 'P5 GET receipt');
  await until(() => evaluate("!!document.querySelector('[data-testid=\"p5-idle\"]') && document.querySelector('[data-testid=\"p5-result\"]')?.textContent?.includes('确认提交')"), 'P5 recovered from persisted native receipt');
  assert.equal(await evaluate("localStorage.getItem('pattern-atlas:p5-native-synthetic-pending:v1')"), null, 'P5 journal not cleared after receipt verification');
  nativeCounts = await (await fetch(p5Origin + '/__p5_test_counts')).json();
  assert.deepEqual(nativeCounts, { evaluationCount: 1, receiptCount: 1, faultConsumed: true }, 'P5 duplicate native SQLite write after UI recovery');
  const p5RecoveredShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(evidenceDir, 'p5-native-receipt-recovered.png'), Buffer.from(p5RecoveredShot.data, 'base64'));
  writeFileSync(join(evidenceDir, 'p5-native-browser-recovery.json'), JSON.stringify({
    status: 'SYNTHETIC_NATIVE_SQLITE_CHROMIUM_PASS',
    sourceCommit: manifest.sourceCommit, platform: process.platform,
    injectedFailure: 'native SQLite models + receipt COMMIT then first HTTP 503',
    recovery: 'production Chromium reload → original key GET receipt → committed',
    originalKey: storedP5.key, ...nativeCounts,
    limitations: ['Synthetic temporary native AAS DB only', 'No general Studio/ZIP mutation integration',
      'No production tenant authentication, multi-tab or cross-device guarantee']
  }, null, 2) + '\n');
  pass('P5-native-SQLite-503-reload-original-receipt-Chromium');

  writeFileSync(join(evidenceDir, 'p0-automated.json'), JSON.stringify({
    status: 'AUTOMATED_PASS', sourceCommit: manifest.sourceCommit, platform: process.platform,
    checks: accepted, limitations: [
      'No product-owner or human visual acceptance',
      'No authenticated representative production backend',
      'External generated-app API tests run in separate stable gate'
    ]
  }, null, 2) + '\n');
  console.log(JSON.stringify({ type: 'P0 production editor automatic scenarios', platform: process.platform, checks: accepted }));

  assert.deepEqual(errors, [], 'Unexpected editor JavaScript exceptions');
  console.log(JSON.stringify({ result: 'PASS', revision: manifest.sourceCommit,
    scenario: 'packaged editor / production React / Chromium',
    platform: process.platform,
    checks: ['SHA-256', 'static JS', 'SPA route', '404 fallback', '/create', '/studio', 'runtime errors',
      windows ? 'Windows start-studio.cmd launcher' : 'POSIX node launcher'] }));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (p5Server) {
    if (windows && p5Server.pid) {
      try { execFileSync('taskkill', ['/PID', String(p5Server.pid), '/T', '/F'], { stdio: 'ignore' }); }
      catch { p5Server.kill(); }
    } else { p5Server.kill(); }
  }
  if (aasBridge) {
    if (windows && aasBridge.pid) {
      try { execFileSync('taskkill', ['/PID', String(aasBridge.pid), '/T', '/F'], { stdio: 'ignore' }); }
      catch { aasBridge.kill(); }
    } else { aasBridge.kill(); }
  }
  if (aasFixtureServer) await new Promise((done) => aasFixtureServer.close(done));
  if (windows && server.pid) {
    // cmd.exe owns the spawned Node process; kill its whole Windows job tree.
    try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch { server.kill(); }
  } else { server.kill(); }
  if (windows && browser?.pid) {
    try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }); }
    catch { browser.kill(); }
  } else { browser?.kill(); }
  await pause(400);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); }
  catch { /* temporary profile cleanup is best-effort */ }
}
