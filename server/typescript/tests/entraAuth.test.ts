import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import { hasRequiredScope, requireAccessAsUser } from '../entraAuth';

test('hasRequiredScope requires the exact delegated API scope', () => {
  assert.equal(hasRequiredScope('User.Read access_as_user'), true);
  assert.equal(hasRequiredScope('access_as_user.extra'), false);
  assert.equal(hasRequiredScope(''), false);
  assert.equal(hasRequiredScope(undefined), false);
});

test('requireAccessAsUser returns 403 when the delegated scope is missing', () => {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req = { auth: { payload: { scp: 'User.Read' } } } as unknown as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    }
  } as unknown as Response;

  requireAccessAsUser(req, res, () => { nextCalled = true; });

  assert.equal(statusCode, 403);
  assert.deepEqual(body, { error: 'The access token does not include the required API scope.' });
  assert.equal(nextCalled, false);
});

test('requireAccessAsUser accepts a token with access_as_user', () => {
  let nextCalled = false;
  const req = { auth: { payload: { scp: 'access_as_user User.Read' } } } as unknown as Request;
  requireAccessAsUser(req, {} as Response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
