import { createHash } from 'node:crypto';

export const GRAPH_APP_ID = '00000003-0000-0000-c000-000000000000';
export const GRAPH_SCOPE_NAMES = Object.freeze([
  'User.Read',
  'Files.Read.All',
  'Mail.Read',
  'Calendars.Read',
  'Chat.Read',
  'ChannelMessage.Read.All',
  'ChannelMessage.Send'
]);

export function stableGuid(seed) {
  const bytes = Buffer.from(createHash('sha256').update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function appDisplayNames(environmentName) {
  const suffix = String(environmentName).trim().replace(/[^a-zA-Z0-9-]/g, '-');
  if (!suffix) throw new Error('AZURE_ENV_NAME is required for Entra application names.');
  return {
    spa: `customer-insights-${suffix}-spa`,
    api: `customer-insights-${suffix}-api`
  };
}

export function normalizeRedirectUris(values) {
  const result = new Set(['http://localhost:4200']);
  for (const value of values ?? []) {
    const trimmed = String(value ?? '').trim().replace(/\/$/, '');
    if (!trimmed) continue;
    const url = new URL(trimmed);
    const isLocalHttp = url.protocol === 'http:' && url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !isLocalHttp) {
      throw new Error(`SPA redirect URI must use HTTPS unless it is localhost: ${trimmed}`);
    }
    result.add(url.toString().replace(/\/$/, ''));
  }
  return [...result].sort();
}

export function requiredResourceAccess(graphScopes, apiAppId, apiScopeId) {
  const missing = GRAPH_SCOPE_NAMES.filter(name => !graphScopes[name]);
  if (missing.length) throw new Error(`Microsoft Graph delegated scope IDs were not found: ${missing.join(', ')}`);
  return [
    {
      resourceAppId: GRAPH_APP_ID,
      resourceAccess: GRAPH_SCOPE_NAMES.map(name => ({ id: graphScopes[name], type: 'Scope' }))
    },
    {
      resourceAppId: apiAppId,
      resourceAccess: [{ id: apiScopeId, type: 'Scope' }]
    }
  ];
}

export function apiApplicationPatch(apiAppId, apiScopeId, spaAppId) {
  return {
    signInAudience: 'AzureADMyOrg',
    identifierUris: [`api://${apiAppId}`],
    api: {
      requestedAccessTokenVersion: 2,
      oauth2PermissionScopes: [{
        id: apiScopeId,
        value: 'access_as_user',
        type: 'Admin',
        isEnabled: true,
        adminConsentDisplayName: 'Access Customer Insights',
        adminConsentDescription: 'Allow the application to access Customer Insights on behalf of the signed-in user.',
        userConsentDisplayName: 'Access Customer Insights',
        userConsentDescription: 'Allow the application to access Customer Insights on your behalf.'
      }],
      preAuthorizedApplications: [{
        appId: spaAppId,
        delegatedPermissionIds: [apiScopeId]
      }]
    }
  };
}

export function spaApplicationPatch(redirectUris, resourceAccess) {
  return {
    signInAudience: 'AzureADMyOrg',
    spa: { redirectUris },
    requiredResourceAccess: resourceAccess
  };
}

export function normalizedScopeSet(scopes) {
  const values = Array.isArray(scopes) ? scopes : String(scopes ?? '').split(/\s+/);
  return [...new Set(values.map(scope => String(scope).trim()).filter(Boolean))].sort();
}
