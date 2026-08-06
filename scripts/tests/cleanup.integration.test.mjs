import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  test('cleanup integration fixtures require a POSIX shell', { skip: true }, () => {});
} else {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const mockCli = `#!/usr/bin/env node
const fs=require('node:fs');const statePath=process.env.MOCK_CLEANUP_STATE;const state=JSON.parse(fs.readFileSync(statePath,'utf8'));const name=require('node:path').basename(process.argv[1]);const args=process.argv.slice(2);state.calls.push([name,...args]);if(name==='azd'&&args[0]==='down')state.groupExists=false;fs.writeFileSync(statePath,JSON.stringify(state));
if(name==='azd'&&args[0]==='env'&&args[1]==='get-values')process.stdout.write(JSON.stringify(state.env));
else if(name==='az'&&args[0]==='group'&&args[1]==='exists')process.stdout.write(String(state.groupExists));
else if(name==='docker'&&state.dockerFails)process.exit(1);else process.exit(0);
`;

  function runCleanup({ groupExists = true, dockerFails = false, expected = 'test', reuseRoot, envOverrides = {}, localOwner = 'test' } = {}) {
    const root = reuseRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'customer-insights-cleanup-'));
    const bin = path.join(root, 'bin');
    if (!fs.existsSync(bin)) {
      fs.mkdirSync(bin);
      for (const name of ['az', 'azd', 'docker']) fs.writeFileSync(path.join(bin, name), mockCli, { mode: 0o755 });
      fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh\ncase "$1" in *scripts/cleanup-entra.mjs) echo cleanup-entra >> "$MOCK_CLEANUP_CHILDREN"; exit 0;; *) exec "${process.execPath}" "$@";; esac\n`, { mode: 0o755 });
    }
    const statePath = path.join(root, 'state.json');
    const childPath = path.join(root, 'children.txt');
    const localEnvPath = path.join(root, '.env');
    fs.writeFileSync(localEnvPath, `CUSTOMER_INSIGHTS_AZD_ENVIRONMENT=${localOwner}\nAI_API_KEY=secret\nPOSTGRES_DATABASE=CustomersDB\n`);
    const env = { AZURE_SUBSCRIPTION_ID: 'sub', AZURE_RESOURCE_GROUP: 'rg-test', AZURE_ENV_NAME: 'test', ENTRA_TENANT_ID: 'tenant', ENTRA_SPA_APP_ID: 'spa', ENTRA_API_APP_ID: 'api', ...envOverrides };
    fs.writeFileSync(statePath, JSON.stringify({ env, groupExists, dockerFails, calls: [] }));
    const azureDir = path.join(repositoryRoot, '.azure', expected);
    fs.rmSync(path.join(azureDir, 'customer-insights-cleanup.json'), { force: true });
    const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/cleanup.mjs'), '--yes', '--environment', expected], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, MOCK_CLEANUP_STATE: statePath, MOCK_CLEANUP_CHILDREN: childPath, CUSTOMER_INSIGHTS_LOCAL_ENV_PATH: localEnvPath },
      encoding: 'utf8'
    });
    return { root, result, state: JSON.parse(fs.readFileSync(statePath, 'utf8')), children: fs.existsSync(childPath) ? fs.readFileSync(childPath, 'utf8') : '', manifest: path.join(azureDir, 'customer-insights-cleanup.json'), localEnvPath };
  }

  test('cleanup captures identifiers, purges the exact environment, verifies absence, and completes', () => {
    const fixture = runCleanup();
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr || fixture.result.stdout);
      assert.match(fixture.result.stdout, /environment=test subscription=sub resourceGroup=rg-test/);
      const down = fixture.state.calls.find(call => call[0] === 'azd' && call[1] === 'down');
      assert.deepEqual(down.slice(1), ['down', '--environment', 'test', '--force', '--purge', '--no-prompt']);
      assert.match(fixture.children, /cleanup-entra/);
      const localEnv = fs.readFileSync(fixture.localEnvPath, 'utf8');
      assert.match(localEnv, /AI_API_KEY=\n/);
      assert.match(localEnv, /POSTGRES_DATABASE=CustomersDB/);
    } finally {
      fs.rmSync(fixture.manifest, { force: true }); fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('cleanup refuses a mismatched environment before deletion', () => {
    const fixture = runCleanup({ expected: 'wrong' });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(fixture.result.stderr, /does not match/);
      assert.equal(fixture.state.calls.some(call => call[0] === 'azd' && call[1] === 'down'), false);
    } finally {
      fs.rmSync(fixture.manifest, { force: true }); fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('cleanup resumes from a saved manifest when Azure is already absent and Docker failure is nonfatal', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-insights-cleanup-resume-'));
    const manifestDirectory = path.join(repositoryRoot, '.azure', 'test');
    const manifest = path.join(manifestDirectory, 'customer-insights-cleanup.json');
    fs.mkdirSync(manifestDirectory, { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ AZURE_SUBSCRIPTION_ID: 'sub', AZURE_RESOURCE_GROUP: 'rg-test', AZURE_ENV_NAME: 'test', ENTRA_TENANT_ID: 'tenant', ENTRA_SPA_APP_ID: 'spa', ENTRA_API_APP_ID: 'api' }));
    const fixture = runCleanup({ groupExists: false, dockerFails: true, reuseRoot: root });
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr || fixture.result.stdout);
      assert.equal(fixture.state.calls.some(call => call[0] === 'azd' && call[1] === 'down'), false);
      assert.match(fixture.result.stderr, /Compose shutdown failed/);
    } finally {
      fs.rmSync(manifest, { force: true }); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('cleanup deletes Azure resources when Entra provisioning never stored a cleanup handle', () => {
    const fixture = runCleanup({ envOverrides: { ENTRA_TENANT_ID: '', ENTRA_SPA_APP_ID: '', ENTRA_API_APP_ID: '' } });
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr || fixture.result.stdout);
      assert.match(fixture.result.stderr, /no complete Entra cleanup handle/);
      assert.equal(fixture.children, '');
    } finally {
      fs.rmSync(fixture.manifest, { force: true }); fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('cleanup does not clear local configuration owned by another environment', () => {
    const fixture = runCleanup({ localOwner: 'other-environment' });
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr || fixture.result.stdout);
      assert.match(fs.readFileSync(fixture.localEnvPath, 'utf8'), /AI_API_KEY=secret/);
    } finally {
      fs.rmSync(fixture.manifest, { force: true }); fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}
