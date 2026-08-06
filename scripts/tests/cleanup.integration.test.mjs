import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mockCli = `#!/usr/bin/env node
const fs=require('node:fs');const statePath=process.env.MOCK_CLEANUP_STATE;const state=JSON.parse(fs.readFileSync(statePath,'utf8'));const name=require('node:path').basename(process.argv[1]);const args=process.argv.slice(2);state.calls.push([name,...args]);fs.writeFileSync(statePath,JSON.stringify(state));
if(name==='azd'&&args[0]==='env'&&args[1]==='get-values')process.stdout.write(JSON.stringify(state.env));
else if(name==='az'&&args[0]==='group'&&args[1]==='exists')process.stdout.write(String(state.groupExists));
else process.exit(0);
`;

function runCleanup(groupExists) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'customer-insights-cleanup-'));
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  for(const name of ['az','azd','docker'])fs.writeFileSync(path.join(bin,name),mockCli,{mode:0o755});
  fs.writeFileSync(path.join(bin,'node'),`#!/bin/sh\ncase "$1" in *scripts/cleanup-entra.mjs) echo cleanup-entra >> "$MOCK_CLEANUP_CHILDREN"; exit 0;; *) exec "${process.execPath}" "$@";; esac\n`,{mode:0o755});
  const statePath=path.join(root,'state.json');const childPath=path.join(root,'children.txt');
  fs.writeFileSync(statePath,JSON.stringify({env:{AZURE_SUBSCRIPTION_ID:'sub',AZURE_RESOURCE_GROUP:'rg-test',AZURE_ENV_NAME:'test'},groupExists,calls:[]}));
  const result=spawnSync(process.execPath,[path.join(repositoryRoot,'scripts/cleanup.mjs'),'--yes'],{cwd:repositoryRoot,env:{...process.env,PATH:`${bin}:${process.env.PATH}`,MOCK_CLEANUP_STATE:statePath,MOCK_CLEANUP_CHILDREN:childPath},encoding:'utf8'});
  return {root,result,state:JSON.parse(fs.readFileSync(statePath,'utf8')),children:fs.existsSync(childPath)?fs.readFileSync(childPath,'utf8'):''};
}

test('cleanup removes Azure first, verifies absence, then removes Entra/environment and stops Compose',()=>{
  const fixture=runCleanup(false);
  try{
    assert.equal(fixture.result.status,0,fixture.result.stderr||fixture.result.stdout);
    assert.deepEqual(fixture.state.calls.map(call=>call.slice(0,3)),[
      ['azd','env','get-values'],['azd','down','--force'],['az','group','exists'],['azd','env','remove'],['docker','compose','down']
    ]);
    assert.match(fixture.children,/cleanup-entra/);
  }finally{fs.rmSync(fixture.root,{recursive:true,force:true});}
});

test('cleanup stops before Entra deletion when the resource group still exists',()=>{
  const fixture=runCleanup(true);
  try{
    assert.notEqual(fixture.result.status,0);
    assert.match(fixture.result.stderr,/still exists/);
    assert.equal(fixture.children,'');
    assert.equal(fixture.state.calls.some(call=>call[0]==='azd'&&call[1]==='env'&&call[2]==='remove'),false);
  }finally{fs.rmSync(fixture.root,{recursive:true,force:true});}
});
