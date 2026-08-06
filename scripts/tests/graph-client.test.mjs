import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireGraphToken } from '../lib/graph-client.mjs';

test('Graph token acquisition falls back to the cached tenant account and restores the subscription', () => {
  const calls = [];
  let tokenAttempts = 0;
  let currentId = 'subscription-id';
  const runCli = (_command, args) => {
    calls.push(args);
    if (args[0] === 'account' && args[1] === 'get-access-token') {
      tokenAttempts += 1;
      if (tokenAttempts === 1) throw new Error('wrong cached identity');
      return 'tenant-token';
    }
    if (args[0] === 'account' && args[1] === 'show') return JSON.stringify({ id: currentId });
    if (args[0] === 'account' && args[1] === 'list') return JSON.stringify([
      { id: 'subscription-id', tenantId: 'subscription-tenant', state: 'Enabled' },
      { id: 'tenant-id', tenantId: 'tenant-id', state: 'Enabled' }
    ]);
    if (args[0] === 'account' && args[1] === 'set') {
      currentId = args[3];
      return '';
    }
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };

  assert.equal(acquireGraphToken({ tenantId: 'tenant-id', runCli }), 'tenant-token');
  assert.equal(currentId, 'subscription-id');
  assert.deepEqual(calls.filter(args => args[0] === 'account' && args[1] === 'set').map(args => args[3]), [
    'tenant-id',
    'subscription-id'
  ]);
});
