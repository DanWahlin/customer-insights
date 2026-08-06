import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './run-cli.mjs';
import { foundryIqFingerprint } from './lib/foundry-iq-state.mjs';
import { assertCloudReadiness } from './lib/cloud-readiness.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const values = JSON.parse(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
const required = ['AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'AI_ACCOUNT_NAME', 'AI_PROJECT_NAME', 'AZURE_AI_SEARCH_SERVICE_NAME', 'ACS_RESOURCE_NAME', 'ACS_EMAIL_SERVICE_NAME'];
for (const key of required) {
  if (!values[key]) throw new Error(`The selected azd environment does not contain ${key}.`);
}

runCli('node', ['scripts/configure-entra.mjs'], { cwd: repositoryRoot, stdio: 'inherit' });
runCli('node', ['scripts/configure-local-env.mjs'], { cwd: repositoryRoot, stdio: 'inherit' });
runCli('node', ['scripts/build-env.js'], { cwd: path.join(repositoryRoot, 'client'), stdio: 'inherit' });

const fingerprint = foundryIqFingerprint(repositoryRoot, [
  'customer documents',
  'server/typescript/scripts',
  'server/typescript/documentIngestion.ts'
], {
  aiAccountName: values.AI_ACCOUNT_NAME,
  aiEndpoint: values.AI_ENDPOINT,
  embeddingModel: values.AI_EMBEDDING_MODEL,
  searchServiceName: values.AZURE_AI_SEARCH_SERVICE_NAME,
  searchEndpoint: values.AZURE_AI_SEARCH_ENDPOINT,
  searchIndex: 'customer-documents-index',
  knowledgeSource: 'customer-documents-ks',
  knowledgeBase: 'customer-documents-kb',
  searchApiVersion: '2026-04-01'
});
if (values.FOUNDRY_IQ_FINGERPRINT !== fingerprint) {
  console.log('Customer document corpus changed; configuring Foundry IQ.');
  runCli('npm', ['ci'], { cwd: path.join(repositoryRoot, 'server/typescript'), stdio: 'inherit' });
  runCli('npm', ['run', 'setup:foundry-iq'], { cwd: path.join(repositoryRoot, 'server/typescript'), stdio: 'inherit' });
  runCli('azd', ['env', 'set', 'FOUNDRY_IQ_FINGERPRINT', fingerprint, '--no-prompt']);
} else {
  console.log('Foundry IQ corpus is unchanged; skipping re-indexing.');
}

const aiState = runCli('az', [
  'cognitiveservices', 'account', 'show',
  '--subscription', values.AZURE_SUBSCRIPTION_ID,
  '--resource-group', values.AZURE_RESOURCE_GROUP,
  '--name', values.AI_ACCOUNT_NAME,
  '--query', 'properties.provisioningState',
  '--output', 'tsv',
  '--only-show-errors'
]);
const modelDeploymentStates = {};
for (const deployment of [values.AI_MODEL, values.AI_EMBEDDING_MODEL]) {
  modelDeploymentStates[deployment] = runCli('az', [
    'cognitiveservices', 'account', 'deployment', 'show',
    '--subscription', values.AZURE_SUBSCRIPTION_ID,
    '--resource-group', values.AZURE_RESOURCE_GROUP,
    '--name', values.AI_ACCOUNT_NAME,
    '--deployment-name', deployment,
    '--query', 'properties.provisioningState',
    '--output', 'tsv',
    '--only-show-errors'
  ]);
}
const searchState = runCli('az', [
  'search', 'service', 'show',
  '--subscription', values.AZURE_SUBSCRIPTION_ID,
  '--resource-group', values.AZURE_RESOURCE_GROUP,
  '--name', values.AZURE_AI_SEARCH_SERVICE_NAME,
  '--query', 'status',
  '--output', 'tsv',
  '--only-show-errors'
]);
const communicationResourceId = `/subscriptions/${values.AZURE_SUBSCRIPTION_ID}/resourceGroups/${values.AZURE_RESOURCE_GROUP}/providers/Microsoft.Communication/communicationServices/${values.ACS_RESOURCE_NAME}`;
const emailResourceId = `/subscriptions/${values.AZURE_SUBSCRIPTION_ID}/resourceGroups/${values.AZURE_RESOURCE_GROUP}/providers/Microsoft.Communication/emailServices/${values.ACS_EMAIL_SERVICE_NAME}`;
const emailDomainResourceId = `${emailResourceId}/domains/AzureManagedDomain`;
const resourceProperty = (resourceId, query) => runCli('az', [
  'resource', 'show',
  '--ids', resourceId,
  '--api-version', '2025-09-01',
  '--query', query,
  '--output', 'json',
  '--only-show-errors'
]);
const communicationState = JSON.parse(resourceProperty(communicationResourceId, 'properties.provisioningState'));
const emailState = JSON.parse(resourceProperty(emailResourceId, 'properties.provisioningState'));
const emailDomainState = JSON.parse(resourceProperty(emailDomainResourceId, 'properties.provisioningState'));
const linkedDomains = JSON.parse(resourceProperty(communicationResourceId, 'properties.linkedDomains'));
assertCloudReadiness({
  aiState,
  modelDeploymentStates,
  searchState,
  communicationState,
  emailState,
  emailDomainState,
  linkedDomains,
  expectedEmailDomainId: emailDomainResourceId
});

console.log('Customer Insights cloud setup is ready.');
console.log(`Manual phone step: open ACS resource ${values.ACS_RESOURCE_NAME}, acquire a number there, then set ACS_PHONE_NUMBER in .env.`);
console.log('The phone number must belong to this ACS resource. PSTN calling and SMS stay disabled until it is configured.');
