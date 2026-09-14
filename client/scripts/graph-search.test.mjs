import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFileSearchRequest, withTransientGraphRetry } from '../src/app/core/graph-search.ts';

test('builds the documented driveItem document search request', () => {
  const request = buildFileSearchRequest('Adatum Corporation');
  assert.deepEqual(request, {
    requests: [{
      entityTypes: ['driveItem'],
      query: { queryString: 'Adatum Corporation AND isDocument=true' },
      from: 0,
      size: 25,
      fields: ['id', 'name', 'webUrl', 'size', 'createdDateTime', 'lastModifiedDateTime', 'createdBy', 'lastModifiedBy']
    }]
  });
});

for (const statusCode of [500, 502]) {
  test(`retries a read operation once after Graph ${statusCode}`, async () => {
    let attempts = 0;
    const result = await withTransientGraphRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw { statusCode };
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  });
}

for (const statusCode of [403, 503, 504]) {
  test(`does not add an application retry for Graph ${statusCode}`, async () => {
    let attempts = 0;
    await assert.rejects(() => withTransientGraphRetry(async () => {
      attempts += 1;
      throw { statusCode };
    }));
    assert.equal(attempts, 1);
  });
}

test('stops after one retry when Graph 500 persists', async () => {
  let attempts = 0;
  await assert.rejects(() => withTransientGraphRetry(async () => {
    attempts += 1;
    throw { statusCode: 500 };
  }));
  assert.equal(attempts, 2);
});
