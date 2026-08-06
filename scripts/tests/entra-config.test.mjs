import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAPH_SCOPE_NAMES,
  apiApplicationPatch,
  appDisplayNames,
  normalizeRedirectUris,
  normalizedScopeSet,
  requiredResourceAccess,
  spaApplicationPatch,
  stableGuid
} from '../lib/entra-config.mjs';

test('stableGuid is deterministic and emits a UUID v4 shape', () => {
  const first = stableGuid('tenant:environment:access_as_user');
  assert.equal(first, stableGuid('tenant:environment:access_as_user'));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('appDisplayNames are deterministic and environment-scoped', () => {
  assert.deepEqual(appDisplayNames('demo west'), {
    spa: 'customer-insights-demo-west-spa',
    api: 'customer-insights-demo-west-api'
  });
});

test('redirect URIs include localhost, normalize HTTPS, and reject insecure remote URLs', () => {
  assert.deepEqual(normalizeRedirectUris(['https://example.test/', 'http://localhost:4200/']), [
    'http://localhost:4200',
    'https://example.test'
  ]);
  assert.throws(() => normalizeRedirectUris(['http://example.test']), /HTTPS/);
});

test('resource access contains only the current Graph scopes plus the API scope', () => {
  const graphScopes = Object.fromEntries(GRAPH_SCOPE_NAMES.map((name, index) => [name, `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`]));
  const result = requiredResourceAccess(graphScopes, 'api-app', 'api-scope');
  assert.deepEqual(result[0].resourceAccess.map(item => item.id), GRAPH_SCOPE_NAMES.map(name => graphScopes[name]));
  assert.deepEqual(result[1], { resourceAppId: 'api-app', resourceAccess: [{ id: 'api-scope', type: 'Scope' }] });
});

test('API and SPA patches enforce v2 delegated-token configuration', () => {
  const api = apiApplicationPatch('api-app', 'scope-id', 'spa-app');
  assert.equal(api.identifierUris[0], 'api://api-app');
  assert.equal(api.api.requestedAccessTokenVersion, 2);
  assert.equal(api.api.oauth2PermissionScopes[0].value, 'access_as_user');
  assert.deepEqual(api.api.preAuthorizedApplications[0].delegatedPermissionIds, ['scope-id']);

  const spa = spaApplicationPatch(['http://localhost:4200'], [{ resourceAppId: 'graph', resourceAccess: [] }]);
  assert.deepEqual(spa.spa.redirectUris, ['http://localhost:4200']);
});

test('normalizedScopeSet is stable and deduplicated', () => {
  assert.deepEqual(normalizedScopeSet('Mail.Read User.Read Mail.Read'), ['Mail.Read', 'User.Read']);
  assert.deepEqual(normalizedScopeSet(['Mail.Read', 'User.Read', 'Mail.Read']), ['Mail.Read', 'User.Read']);
});
