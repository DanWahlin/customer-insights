import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import { handleAuthenticationError, hasRequiredScope, requireAccessAsUser, requireBearerHeader } from '../entraAuth';

function createResponse() {
  let statusCode = 200;
  let body: unknown;
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    }
  } as unknown as Response;
  return { response, get statusCode() { return statusCode; }, get body() { return body; }, headers };
}

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

test('requireBearerHeader accepts one bearer token in the authorization header', () => {
  let nextCalled = false;
  const req = {
    headers: { authorization: 'Bearer header-token' },
    query: {},
    body: {}
  } as unknown as Request;
  requireBearerHeader(req, createResponse().response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireBearerHeader rejects missing and alternate token transports', () => {
  for (const req of [
    { headers: {}, query: {}, body: {} },
    { headers: { authorization: 'Basic credentials' }, query: {}, body: {} },
    { headers: {}, query: { access_token: 'query-token' }, body: {} },
    { headers: {}, query: {}, body: { access_token: 'body-token' } },
    { headers: { authorization: 'Bearer header-token' }, query: { access_token: 'query-token' }, body: {} }
  ]) {
    let nextCalled = false;
    const result = createResponse();
    requireBearerHeader(req as unknown as Request, result.response, () => { nextCalled = true; });
    assert.equal(result.statusCode, 401);
    assert.equal(result.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(result.body, { error: 'A valid Microsoft Entra access token is required.' });
    assert.equal(nextCalled, false);
  }
});

test('handleAuthenticationError normalizes configured claim mismatches to 401', () => {
  for (const claim of ['tid', 'azp']) {
    let nextCalled = false;
    const result = createResponse();
    handleAuthenticationError(
      new Error(`Unexpected '${claim}' value`),
      {} as Request,
      result.response,
      () => { nextCalled = true; }
    );
    assert.equal(result.statusCode, 401);
    assert.deepEqual(result.body, { error: 'A valid Microsoft Entra access token is required.' });
    assert.equal(nextCalled, false);
  }
});

test('handleAuthenticationError passes unrelated server failures through', () => {
  const failure = new Error('database unavailable');
  let nextError: unknown;
  handleAuthenticationError(failure, {} as Request, createResponse().response, error => { nextError = error; });
  assert.equal(nextError, failure);
});
