import fs from 'node:fs';
import { runCli } from './run-cli.mjs';
import { createGraphClient } from './lib/graph-client.mjs';

if (!process.argv.includes('--yes')) {
  throw new Error('Cleanup is destructive. Re-run with --yes after selecting the intended azd environment.');
}
const manifestIndex = process.argv.indexOf('--manifest');
const manifestPath = manifestIndex >= 0 ? process.argv[manifestIndex + 1] : '';
const values = manifestPath
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : JSON.parse(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
const tenantId = values.ENTRA_TENANT_ID || values.AZURE_TENANT_ID;
const applications = [
  ['ENTRA_SPA_APP_ID', values.ENTRA_SPA_APP_ID],
  ['ENTRA_API_APP_ID', values.ENTRA_API_APP_ID]
];
if (!tenantId) throw new Error('The cleanup input does not contain an Entra tenant ID.');
for (const [key, appId] of applications) {
  if (!appId) throw new Error(`The cleanup input does not contain ${key}.`);
}

const graph = await createGraphClient({ tenantId, runCli });
const verified = [];
for (const [key, appId] of applications) {
  const filter = encodeURIComponent(`appId eq '${String(appId).replaceAll("'", "''")}'`);
  const result = await graph('GET', `/applications?$filter=${filter}`);
  if (result.value.length === 0) continue;
  if (result.value.length !== 1) throw new Error(`${key} ${appId} was found more than once; refusing cleanup.`);
  const application = result.value[0];
  if (!application.tags?.includes('customer-insights-azd')) {
    throw new Error(`${key} ${appId} lacks the customer-insights-azd ownership marker; refusing cleanup.`);
  }
  verified.push({ key, appId, objectId: application.id, filter });
}

for (const application of verified) {
  await graph('DELETE', `/applications/${application.objectId}`);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const verification = await graph('GET', `/applications/${application.objectId}`).catch(error => {
      if (error.status === 404) return null;
      throw error;
    });
    if (!verification) break;
    if (attempt === 6) throw new Error(`${application.key} ${application.appId} still exists after cleanup.`);
    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
}

console.log('Removed the selected azd environment\'s Customer Insights Entra applications.');
