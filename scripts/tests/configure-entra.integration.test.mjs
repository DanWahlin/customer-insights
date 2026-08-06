import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GRAPH_SCOPE_NAMES } from '../lib/entra-config.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const mockCli = `#!/usr/bin/env node
const fs = require('node:fs');
const statePath = process.env.MOCK_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2);
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const output = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
if (process.argv[1].endsWith('/azd')) {
  if (args[0] === 'env' && args[1] === 'get-values') return output(state.env);
  if (args[0] === 'env' && args[1] === 'set') { state.env[args[2]] = args[3]; save(); process.exit(0); }
  process.exit(2);
}
if (args[0] === 'account' && args[1] === 'show') return output(state.account);
if (args[0] === 'account' && args[1] === 'get-access-token') return output('mock-graph-token');
process.stderr.write('Unhandled mock command: ' + JSON.stringify(args)); process.exit(2);
`;

test('configure-entra reconciles applications, service principals, grants, and azd values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-insights-entra-'));
  try {
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    for (const name of ['az', 'azd']) {
      fs.writeFileSync(path.join(bin, name), mockCli, { mode: 0o755 });
    }
    const graphScopes = GRAPH_SCOPE_NAMES.map((value, index) => ({
      value,
      id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      isEnabled: true
    }));
    const statePath = path.join(root, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({
      env: { AZURE_ENV_NAME: 'test', ENTRA_TENANT_ID: 'tenant-1' },
      account: { id: 'subscription-1', tenantId: 'tenant-1', state: 'Enabled' },
      apps: [],
      servicePrincipals: [{ id: 'graph-sp', appId: '00000003-0000-0000-c000-000000000000', oauth2PermissionScopes: graphScopes }],
      grants: [],
      requests: []
    }));
    fs.writeFileSync(path.join(root, '.env'), [
      'ENTRAID_CLIENT_ID=unrelated-spa',
      'ENTRAID_API_CLIENT_ID=unrelated-api',
      'CLIENT_ORIGIN=https://unrelated.example'
    ].join('\n'));

    const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/configure-entra.mjs')], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        MOCK_STATE: statePath,
        NODE_OPTIONS: `--import=${path.join(repositoryRoot, 'scripts/tests/mock-graph-fetch.mjs')}`
      },
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.apps.length, 2);
    const api = state.apps.find(app => app.displayName.endsWith('-api'));
    const spa = state.apps.find(app => app.displayName.endsWith('-spa'));
    assert.equal(api.api.requestedAccessTokenVersion, 2);
    assert.equal(api.api.oauth2PermissionScopes[0].value, 'access_as_user');
    assert.deepEqual(api.api.preAuthorizedApplications[0].appId, spa.appId);
    assert.deepEqual(spa.spa.redirectUris, ['http://localhost:4200']);
    assert.notEqual(spa.appId, 'unrelated-spa');
    assert.notEqual(api.appId, 'unrelated-api');
    assert.deepEqual(spa.requiredResourceAccess[0].resourceAccess.length, GRAPH_SCOPE_NAMES.length);
    assert.equal(state.grants.length, 2);
    assert.deepEqual(state.grants.find(grant => grant.resourceId === 'graph-sp').scope.split(' ').sort(), [...GRAPH_SCOPE_NAMES].sort());
    assert.equal(state.env.ENTRA_API_SCOPE, `api://${api.appId}/access_as_user`);
    assert.equal(state.env.ENTRA_SPA_APP_ID, spa.appId);
    assert.equal(state.account.id, 'subscription-1');
    assert.ok(state.apps.every(app => app.tags.includes('customer-insights-azd')));

    const cleanup = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/cleanup-entra.mjs'), '--yes'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        MOCK_STATE: statePath,
        NODE_OPTIONS: `--import=${path.join(repositoryRoot, 'scripts/tests/mock-graph-fetch.mjs')}`
      },
      encoding: 'utf8'
    });
    assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).apps.length, 0);

    const cleanupRetry = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/cleanup-entra.mjs'), '--yes'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        MOCK_STATE: statePath,
        NODE_OPTIONS: `--import=${path.join(repositoryRoot, 'scripts/tests/mock-graph-fetch.mjs')}`
      },
      encoding: 'utf8'
    });
    assert.equal(cleanupRetry.status, 0, cleanupRetry.stderr || cleanupRetry.stdout);

    const unsafeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    unsafeState.env.ENTRA_SPA_APP_ID = 'unsafe-app';
    unsafeState.env.ENTRA_API_APP_ID = 'unsafe-api';
    unsafeState.apps = [
      { id: 'unsafe-object', appId: 'unsafe-app', displayName: 'unowned-spa', tags: [] },
      { id: 'unsafe-api-object', appId: 'unsafe-api', displayName: 'owned-api', tags: ['customer-insights-azd'] }
    ];
    fs.writeFileSync(statePath, JSON.stringify(unsafeState));
    const refused = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/cleanup-entra.mjs'), '--yes'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        MOCK_STATE: statePath,
        NODE_OPTIONS: `--import=${path.join(repositoryRoot, 'scripts/tests/mock-graph-fetch.mjs')}`
      },
      encoding: 'utf8'
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /ownership marker/);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).apps.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
