import { runCli } from './run-cli.mjs';
import { createGraphClient } from './lib/graph-client.mjs';
import {
  GRAPH_APP_ID,
  GRAPH_SCOPE_NAMES,
  apiApplicationPatch,
  appDisplayNames,
  normalizeRedirectUris,
  normalizedScopeSet,
  requiredResourceAccess,
  spaApplicationPatch,
  stableGuid
} from './lib/entra-config.mjs';

const parseJson = value => value ? JSON.parse(value) : null;
let graph;

function azdValues() {
  return parseJson(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
}



function escaped(value) {
  return String(value).replaceAll("'", "''");
}

function filteredPath(resource, filter) {
  return `/${resource}?$filter=${encodeURIComponent(filter)}`;
}

async function findApplication(appId, displayName) {
  if (appId) {
    const result = await graph('GET', filteredPath('applications', `appId eq '${escaped(appId)}'`));
    if (result.value.length > 1) throw new Error(`Stored Entra application ${appId} was found more than once.`);
    if (result.value.length === 1) return result.value[0];
  }
  const result = await graph('GET', filteredPath('applications', `displayName eq '${escaped(displayName)}'`));
  if (result.value.length > 1) throw new Error(`Multiple Entra applications are named ${displayName}; refusing to choose one.`);
  const application = result.value[0] ?? null;
  if (application && !application.tags?.includes('customer-insights-azd')) {
    throw new Error(`Entra application ${displayName} exists without the customer-insights-azd ownership marker. Set its app ID explicitly to adopt it.`);
  }
  return application;
}

async function ensureApplication(existingAppId, displayName) {
  return (await findApplication(existingAppId, displayName)) ?? graph('POST', '/applications', {
    displayName,
    signInAudience: 'AzureADMyOrg',
    tags: ['customer-insights-azd']
  });
}

async function ensureServicePrincipal(appId) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const result = await graph('GET', filteredPath('servicePrincipals', `appId eq '${escaped(appId)}'`));
    if (result.value.length === 1) return result.value[0];
    if (result.value.length > 1) throw new Error(`Multiple service principals exist for ${appId}.`);
    try {
      return await graph('POST', '/servicePrincipals', { appId });
    } catch (error) {
      if (attempt === 8) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}

async function ensureGrant(clientId, resourceId, desiredScopes) {
  const result = await graph('GET', filteredPath('oauth2PermissionGrants', `clientId eq '${clientId}' and resourceId eq '${resourceId}' and consentType eq 'AllPrincipals'`));
  if (result.value.length > 1) throw new Error('Multiple tenant-wide delegated grants exist for one client/resource pair.');
  const scope = normalizedScopeSet(desiredScopes).join(' ');
  if (!result.value.length) {
    await graph('POST', '/oauth2PermissionGrants', { clientId, resourceId, consentType: 'AllPrincipals', principalId: null, scope });
    return;
  }
  const current = result.value[0];
  if (normalizedScopeSet(current.scope).join(' ') !== scope) {
    await graph('PATCH', `/oauth2PermissionGrants/${current.id}`, { scope });
  }
}

async function configureApiApplication(applicationObjectId, patch) {
  const { preAuthorizedApplications, ...apiWithoutPreauthorization } = patch.api;
  await graph('PATCH', `/applications/${applicationObjectId}`, {
    ...patch,
    api: apiWithoutPreauthorization
  });
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await graph('PATCH', `/applications/${applicationObjectId}`, patch);
      return;
    } catch (error) {
      if (attempt === 8 || ![400, 404].includes(error.status)) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}

function graphScopeMap(graphServicePrincipal) {
  return Object.fromEntries((graphServicePrincipal.oauth2PermissionScopes ?? [])
    .filter(scope => scope.isEnabled && GRAPH_SCOPE_NAMES.includes(scope.value))
    .map(scope => [scope.value, scope.id]));
}

async function main() {
  const values = azdValues();
  const environmentName = values.AZURE_ENV_NAME;
  const selectedTenant = parseJson(runCli('az', ['account', 'show', '--output', 'json'])).tenantId;
  const requestedTenant = values.ENTRA_TENANT_ID || values.AZURE_TENANT_ID || selectedTenant;
  if (!requestedTenant) throw new Error('Set ENTRA_TENANT_ID when the Microsoft 365 tenant differs from the selected Azure tenant.');
  graph = await createGraphClient({ tenantId: requestedTenant, runCli });

    const names = appDisplayNames(environmentName, values.CUSTOMER_INSIGHTS_INSTANCE_ID);
    const apiApp = await ensureApplication(values.ENTRA_API_APP_ID, names.api);
    const spaApp = await ensureApplication(values.ENTRA_SPA_APP_ID, names.spa);
    for (const [key, value] of [['ENTRA_API_APP_ID', apiApp.appId], ['ENTRA_SPA_APP_ID', spaApp.appId]]) {
      runCli('azd', ['env', 'set', key, value, '--no-prompt']);
      values[key] = value;
    }
    const existingScopeId = apiApp.api?.oauth2PermissionScopes?.find(scope => scope.value === 'access_as_user')?.id;
    const scopeId = values.ENTRA_API_SCOPE_ID || existingScopeId || stableGuid(`${requestedTenant}:${environmentName}:access_as_user`);
    const redirectUris = normalizeRedirectUris([
      values.CLIENT_ORIGIN || 'http://localhost:4200',
      ...(values.ENTRA_ADDITIONAL_REDIRECT_URIS || '').split(',')
    ]);

    await configureApiApplication(apiApp.id, apiApplicationPatch(apiApp.appId, scopeId, spaApp.appId));
    const graphSp = (await graph('GET', filteredPath('servicePrincipals', `appId eq '${GRAPH_APP_ID}'`))).value[0];
    if (!graphSp) throw new Error('Microsoft Graph service principal was not found in the tenant.');
    await graph('PATCH', `/applications/${spaApp.id}`, spaApplicationPatch(
      redirectUris,
      requiredResourceAccess(graphScopeMap(graphSp), apiApp.appId, scopeId)
    ));

    const spaSp = await ensureServicePrincipal(spaApp.appId);
    const apiSp = await ensureServicePrincipal(apiApp.appId);
    try {
      await ensureGrant(spaSp.id, graphSp.id, GRAPH_SCOPE_NAMES);
      await ensureGrant(spaSp.id, apiSp.id, ['access_as_user']);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new Error(`Entra applications were configured, but tenant-wide consent failed. Run azd up as a tenant administrator authorized to grant these delegated permissions.${detail}`);
    }

    for (const [key, value] of Object.entries({
      ENTRA_TENANT_ID: requestedTenant,
      ENTRA_SPA_APP_ID: spaApp.appId,
      ENTRA_API_APP_ID: apiApp.appId,
      ENTRA_API_SCOPE_ID: scopeId,
      ENTRA_API_SCOPE: `api://${apiApp.appId}/access_as_user`
    })) {
      runCli('azd', ['env', 'set', key, value, '--no-prompt']);
    }
    console.log('Configured and verified Customer Insights Entra applications and delegated consent.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
