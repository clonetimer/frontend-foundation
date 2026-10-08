#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function reduction(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return null;
  return ((before - after) / before) * 100;
}

export function evaluate(results) {
  const p = results.proComponents ?? {};
  const pReduction = reduction(p.ownedLocBefore, p.ownedLocAfter);
  const proChecks = {
    compiled: p.compiled === true,
    testsPassed: p.testsPassed === true,
    kernelContractStable: p.kernelContractChanges === 0,
    noAntdDowngrade: p.antdDowngrade === false,
    noRouterDowngrade: p.routerDowngrade === false,
    apiContractPreserved: p.apiContractPreserved === true,
    ownedLocReductionAtLeast25Pct: pReduction !== null && pReduction >= 25,
    noFoundationPublicExportGrowth: Number.isFinite(p.foundationPublicExportDelta) && p.foundationPublicExportDelta <= 0,
    bundleDeltaWithin200KiB: Number.isFinite(p.bundleGzipDeltaKiB) && p.bundleGzipDeltaKiB <= 200
  };

  const r = results.refineCore ?? {};
  const rReduction = reduction(r.projectGlueLocBefore, r.projectGlueLocAfter);
  const refineChecks = {
    compiled: r.compiled === true,
    testsPassed: r.testsPassed === true,
    kernelContractStable: r.kernelContractChanges === 0,
    noRefineAntd: r.usesRefineAntd === false,
    noRefineRouter: r.usesRefineRouter === false,
    noAntdDowngrade: r.antdDowngrade === false,
    noRouterDowngrade: r.routerDowngrade === false,
    apiContractPreserved: r.apiContractPreserved === true,
    bridgeAtMost200Loc: Number.isFinite(r.bridgeLoc) && r.bridgeLoc <= 200,
    projectGlueReductionAtLeast20Pct: rReduction !== null && rReduction >= 20
  };

  const pass = (checks) => Object.values(checks).every(Boolean);
  return {
    proComponents: { pass: pass(proChecks), ownedLocReductionPct: pReduction, checks: proChecks },
    refineCore: { pass: pass(refineChecks), projectGlueReductionPct: rReduction, checks: refineChecks }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const input = process.argv.slice(2).find((arg) => arg !== '--');
  if (!input) {
    console.error('Usage: node tooling/oss/scorecard.mjs <poc-results.json>');
    process.exitCode = 1;
  } else {
    const result = evaluate(JSON.parse(readFileSync(resolve(input), 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    if (!result.proComponents.pass || !result.refineCore.pass) process.exitCode = 2;
  }
}
