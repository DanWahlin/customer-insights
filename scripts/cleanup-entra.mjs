import { runCli } from './run-cli.mjs';
import { createGraphClient } from './lib/graph-client.mjs';

if (!process.argv.includes('--yes')) {
  throw new Error('Cleanup is destructive. Re-run with --yes after selecting the intended azd environment.');
}

const values = JSON.parse(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
const tenantId = values.ENTRA_TENANT_ID || values.AZURE_TENANT_ID;
const applications = [
  ['ENTRA_SPA_APP_ID', values.ENTRA_SPA_APP_ID],
  ['ENTRA_API_APP_ID', values.ENTRA_API_APP_ID]
];
if (!tenantId) throw new Error('The selected azd environment does not contain ENTRA_TENANT_ID.');
for (const [key, appId] of applications) {
  if (!appId) throw new Error(`The selected azd environment does not contain ${key}.`);
}

const graph = await createGraphClient({ tenantId, runCli });
for (const [key, appId] of applications) {
  const filter = encodeURIComponent(`appId eq '${String(appId).replaceAll("'", "''")}'`);
  const result = await graph('GET', `/applications?$filter=${filter}`);
  if (result.value.length === 0) continue;
  if (result.value.length !== 1) {
    throw new Error(`${key} ${appId} was found more than once; refusing cleanup.`);
  }
  const application = result.value[0];
  if (!application.tags?.includes('customer-insights-azd')) {
    throw new Error(`${key} ${appId} lacks the customer-insights-azd ownership marker; refusing cleanup.`);
  }
  await graph('DELETE', `/applications/${application.id}`);
  const verification = await graph('GET', `/applications?$filter=${filter}`);
  if (verification.value.length !== 0) throw new Error(`${key} ${appId} still exists after cleanup.`);
}

console.log('Removed the selected azd environment\'s Customer Insights Entra applications.');
