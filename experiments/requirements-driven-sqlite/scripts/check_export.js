#!/usr/bin/env node
/* global require, process, console, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS TypeScript adapter scripts */
/* Syntax/import existence check; NOT the equivalent of npm run build. */
const fs=require('node:fs'),path=require('node:path');
const [folder]=process.argv.slice(2).map(p=>path.resolve(p));if(!folder){console.error('Usage: node check_export.js <unpacked-export-folder>');process.exit(2)}
let ts;for(const id of [process.env.TYPESCRIPT_PATH,'typescript']){if(!id)continue;try{ts=require(id);break}catch { /* optional resolution failed */ }}if(!ts){console.error('TypeScript not found');process.exit(2)}
let count=0,errors=[];function walk(dir){for(const name of fs.readdirSync(dir)){const full=path.join(dir,name);if(fs.statSync(full).isDirectory())walk(full);else if(/\.tsx?$/.test(name)){
count++;const src=fs.readFileSync(full,'utf8');const sf=ts.createSourceFile(full,src,ts.ScriptTarget.Latest,true,name.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
for(const d of sf.parseDiagnostics)errors.push(name+':'+ts.flattenDiagnosticMessageText(d.messageText,' '));
for(const m of src.matchAll(/\b(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']/g)){const target=path.resolve(path.dirname(full),m[1]);if(!['','.ts','.tsx','.js','.jsx','.json','.css'].some(e=>fs.existsSync(target+e))&&!fs.existsSync(path.join(target,'index.ts')))errors.push(name+': missing '+m[1]);}
}}};walk(folder);
console.log(JSON.stringify({typescriptFiles:count,diagnostics:errors,passed:!errors.length},null,2));if(errors.length)process.exitCode=1;
