import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foundryIqFingerprint } from '../lib/foundry-iq-state.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const mockCli = `#!/usr/bin/env node
const fs=require('node:fs'); const statePath=process.env.MOCK_POST_STATE; const state=JSON.parse(fs.readFileSync(statePath,'utf8')); const args=process.argv.slice(2); const name=require('node:path').basename(process.argv[1]);
state.calls.push([name,...args]); fs.writeFileSync(statePath,JSON.stringify(state));
if(name==='azd' && args[0]==='env' && args[1]==='get-values') process.stdout.write(JSON.stringify(state.env));
else if(name==='az' && args[0]==='cognitiveservices') process.stdout.write('Succeeded');
else if(name==='az' && args[0]==='search') process.stdout.write('running');
else if(name==='az' && args[0]==='resource' && args[1]==='show') {
  const query=args[args.indexOf('--query')+1];
  if(query==='properties.linkedDomains') {
    process.stdout.write(JSON.stringify(['/subscriptions/'+state.env.AZURE_SUBSCRIPTION_ID+'/resourceGroups/'+state.env.AZURE_RESOURCE_GROUP+'/providers/Microsoft.Communication/emailServices/'+state.env.ACS_EMAIL_SERVICE_NAME+'/domains/AzureManagedDomain']));
  } else process.stdout.write(JSON.stringify('Succeeded'));
}
else process.exit(0);
`;

test('postprovision skips unchanged Foundry IQ corpus', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-insights-post-'));
  try {
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    for (const name of ['az','azd','npm']) fs.writeFileSync(path.join(bin,name),mockCli,{mode:0o755});
    fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh
case "$1" in
  *scripts/configure-entra.mjs|*scripts/configure-local-env.mjs|*scripts/build-env.js) exit 0 ;;
  *) exec "${process.execPath}" "$@" ;;
esac
`, { mode: 0o755 });
    const env={
      AZURE_SUBSCRIPTION_ID:'sub',AZURE_RESOURCE_GROUP:'rg',AI_ACCOUNT_NAME:'ai',AI_PROJECT_NAME:'project',AZURE_AI_SEARCH_SERVICE_NAME:'search',ACS_RESOURCE_NAME:'acs',ACS_EMAIL_SERVICE_NAME:'email'
    };
    const fingerprint = foundryIqFingerprint(repositoryRoot, ['customer documents','server/typescript/scripts','server/typescript/documentIngestion.ts'], {
      aiAccountName: env.AI_ACCOUNT_NAME, aiEndpoint: env.AI_ENDPOINT, embeddingModel: env.AI_EMBEDDING_MODEL,
      searchServiceName: env.AZURE_AI_SEARCH_SERVICE_NAME, searchEndpoint: env.AZURE_AI_SEARCH_ENDPOINT,
      searchIndex:'customer-documents-index', knowledgeSource:'customer-documents-ks', knowledgeBase:'customer-documents-kb', searchApiVersion:'2026-04-01'
    });
    const statePath=path.join(root,'state.json');
    fs.writeFileSync(statePath,JSON.stringify({env:{...env,FOUNDRY_IQ_FINGERPRINT:fingerprint},calls:[]}));
    const result=spawnSync(process.execPath,[path.join(repositoryRoot,'scripts/postprovision.mjs')],{cwd:repositoryRoot,env:{...process.env,PATH:`${bin}:${process.env.PATH}`,MOCK_POST_STATE:statePath},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
    assert.equal(state.calls.some(call=>call[0]==='npm'),false);
    assert.equal(state.calls.filter(call=>call[0]==='az' && call[1]==='resource' && call[2]==='show').length,4);
    assert.match(result.stdout,/unchanged; skipping re-indexing/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
