import { runCli } from './run-cli.mjs';
import { acquireGraphToken } from './lib/graph-client.mjs';

const values = JSON.parse(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
const subscriptionId = values.AZURE_SUBSCRIPTION_ID;
if (!subscriptionId) throw new Error('Set AZURE_SUBSCRIPTION_ID before running azd up.');

const account = JSON.parse(runCli('az', ['account', 'show', '--output', 'json']));
const subscriptions = JSON.parse(runCli('az', ['account', 'list', '--all', '--output', 'json']));
if (!subscriptions.some(subscription => subscription.id === subscriptionId && subscription.state === 'Enabled')) {
  throw new Error(`Azure CLI is not authenticated to enabled subscription ${subscriptionId}.`);
}

if (values.ENTRA_TENANT_ID) {
  acquireGraphToken({ tenantId: values.ENTRA_TENANT_ID, runCli });
}

for (const namespace of ['Microsoft.CognitiveServices', 'Microsoft.Search', 'Microsoft.Communication']) {
  const state = runCli('az', ['provider', 'show', '--subscription', subscriptionId, '--namespace', namespace, '--query', 'registrationState', '--output', 'tsv']);
  if (state !== 'Registered') {
    console.log(`Registering Azure provider ${namespace}.`);
    runCli('az', ['provider', 'register', '--subscription', subscriptionId, '--namespace', namespace, '--wait']);
  }
}

const existingFreeSearch = JSON.parse(runCli('az', [
  'resource', 'list',
  '--subscription', subscriptionId,
  '--resource-type', 'Microsoft.Search/searchServices',
  '--query', "[?sku.name=='free'].{name:name,resourceGroup:resourceGroup}",
  '--output', 'json',
  '--only-show-errors'
]));
const managedSearchExists = existingFreeSearch.some(service =>
  service.name === values.AZURE_AI_SEARCH_SERVICE_NAME &&
  service.resourceGroup?.toLowerCase() === values.AZURE_RESOURCE_GROUP?.toLowerCase()
);
const searchSku = String(values.AZURE_AI_SEARCH_SKU || 'free').toLowerCase();
if (searchSku === 'free' && existingFreeSearch.length && !managedSearchExists) {
  throw new Error(`Subscription ${subscriptionId} already contains Azure AI Search Free service ${existingFreeSearch[0].name}. Run "azd env set AZURE_AI_SEARCH_SKU basic" (billable) or use a different subscription.`);
}

console.log(`Preflight passed for Azure subscription ${subscriptionId} and signed-in tenant ${account.tenantId}.`);
