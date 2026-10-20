#!/usr/bin/env node
/* Execute the real frozen FF Studio model/parser and exporter, without a browser.
 Usage: node ff_import_export.js <FF-extracted-repository> <atlas.studio.json> <output.zip>
 Requires TypeScript available in the FF node_modules or NODE_PATH (no other runtime dependencies).
*/
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const [root, inputFile, outputFile] = process.argv.slice(2).map(x=>x&&path.resolve(x));
if(!root || !inputFile || !outputFile){console.error('Usage: node ff_import_export.js <FF-repo-root> <input.studio.json> <output.zip>');process.exit(2)}
let ts;for(const name of [path.join(root,'node_modules/typescript'),process.env.TYPESCRIPT_PATH,'typescript']){if(!name)continue;try{ts=require(name);break}catch{}}
if(!ts){console.error('Install TypeScript in FF checkout or provide TYPESCRIPT_PATH to TypeScript module.');process.exit(2)}
require.extensions['.ts']=(mod,filename)=>{const input=fs.readFileSync(filename,'utf8');const result=ts.transpileModule(input,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});mod._compile(result.outputText,filename)};
const oldResolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...args){if(request.startsWith('.')&&parent){const candidate=path.resolve(path.dirname(parent.filename),request);if(fs.existsSync(candidate+'.ts'))request=candidate+'.ts'}return oldResolve.call(this,request,parent,...args)};
const studioDir=path.join(root,'apps/showcase/src/modules/pattern-atlas/studio');
const model=require(path.join(studioDir,'model.ts'));const exporter=require(path.join(studioDir,'exporter.ts'));
(async()=>{
 const doc=model.parseStudioFile(fs.readFileSync(inputFile,'utf8'));
 const normalized=model.serializeStudioDocument(doc);
 const same=model.serializeStudioDocument(model.parseStudioFile(normalized));
 if(normalized!==same)throw Error('Studio roundtrip mismatch');
 const files=exporter.projectExportFiles(doc);const bytes=Buffer.from(await exporter.zipTextFiles(files).arrayBuffer());
 fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,bytes);
 const proof={modelParse:'PASS',studioRoundtrip:'PASS',export:'PASS',pages:doc.blueprint.pages.map(p=>p.id),dataSources:doc.dataSources.map(x=>x.id),widgets:Object.keys(doc.decorations).length,files:files.map(x=>x.name),zipBytes:bytes.length};
 console.log(JSON.stringify(proof,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
