import assert from 'node:assert/strict';
import test from 'node:test';
import { isMsalAuthenticationResponse } from '../src/auth-callback.ts';

test('recognizes an authorization-code response in the fragment', () => {
  assert.equal(isMsalAuthenticationResponse('', '#code=redacted&state=opaque'), true);
});

test('recognizes an OAuth error response with state', () => {
  assert.equal(isMsalAuthenticationResponse('', '#error=access_denied&error_description=redacted&state=opaque'), true);
});

test('does not treat an ordinary state URL as an authentication response', () => {
  assert.equal(isMsalAuthenticationResponse('?state=customer-filter', ''), false);
});

test('does not treat an unrelated code URL without state as an authentication response', () => {
  assert.equal(isMsalAuthenticationResponse('?code=customer-code', ''), false);
});

test('does not require window.opener to recognize the callback', () => {
  assert.equal(isMsalAuthenticationResponse('', '#code=redacted&state=opaque'), true);
});
