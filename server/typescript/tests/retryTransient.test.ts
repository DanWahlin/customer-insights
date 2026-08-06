import test from 'node:test';
import assert from 'node:assert/strict';
import { retryTransient } from '../retryTransient';

test('retryTransient retries transient failures and returns the result', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const result = await retryTransient(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('not ready'), { status: 401 });
    return 'ready';
  }, error => (error as { status?: number }).status === 401, {
    attempts: 3,
    delayMs: 5,
    wait: async delay => { delays.push(delay); }
  });
  assert.equal(result, 'ready');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [5, 5]);
});

test('retryTransient does not retry permanent failures', async () => {
  let attempts = 0;
  await assert.rejects(() => retryTransient(async () => {
    attempts += 1;
    throw Object.assign(new Error('bad request'), { status: 400 });
  }, error => (error as { status?: number }).status !== 400, {
    attempts: 3,
    wait: async () => {}
  }), /bad request/);
  assert.equal(attempts, 1);
});
