import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './run-cli.mjs';
import { phoneConfigurationForResource, updateEnvironmentText } from './lib/env-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const envPath = path.join(repositoryRoot, '.env');
const examplePath = path.join(repositoryRoot, '.env.example');

function requireValue(values, key) {
  const value = values[key] == null ? '' : String(values[key]).trim();
  if (!value) throw new Error(`The selected azd environment does not contain ${key}. Run azd provision first.`);
  return value;
}


const values = JSON.parse(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
const subscriptionId = requireValue(values, 'AZURE_SUBSCRIPTION_ID');
const resourceGroup = requireValue(values, 'AZURE_RESOURCE_GROUP');
const aiAccountName = requireValue(values, 'AI_ACCOUNT_NAME');
const searchServiceName = requireValue(values, 'AZURE_AI_SEARCH_SERVICE_NAME');
const communicationServiceName = requireValue(values, 'ACS_RESOURCE_NAME');
const emailServiceName = requireValue(values, 'ACS_EMAIL_SERVICE_NAME');
const entraTenantId = requireValue(values, 'ENTRA_TENANT_ID');
const entraSpaAppId = requireValue(values, 'ENTRA_SPA_APP_ID');
const entraApiAppId = requireValue(values, 'ENTRA_API_APP_ID');
const entraApiScope = requireValue(values, 'ENTRA_API_SCOPE');
const aiEndpoint = values.AI_ENDPOINT || `https://${aiAccountName}.openai.azure.com/`;
const searchEndpoint = values.AZURE_AI_SEARCH_ENDPOINT || `https://${searchServiceName}.search.windows.net`;

const aiKey = runCli('az', [
  'cognitiveservices', 'account', 'keys', 'list',
  '--subscription', subscriptionId,
  '--resource-group', resourceGroup,
  '--name', aiAccountName,
  '--query', 'key1',
  '--output', 'tsv',
  '--only-show-errors'
], { redactOutput: true });
const searchKey = runCli('az', [
  'search', 'admin-key', 'show',
  '--subscription', subscriptionId,
  '--resource-group', resourceGroup,
  '--service-name', searchServiceName,
  '--query', 'primaryKey',
  '--output', 'tsv',
  '--only-show-errors'
], { redactOutput: true });
const communicationResourceUrl = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Communication/communicationServices/${encodeURIComponent(communicationServiceName)}`;
const emailDomainUrl = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Communication/emailServices/${encodeURIComponent(emailServiceName)}/domains/AzureManagedDomain`;
const acsConnectionString = runCli('az', [
  'rest',
  '--method', 'POST',
  '--url', `${communicationResourceUrl}/listKeys?api-version=2025-09-01`,
  '--query', 'primaryConnectionString',
  '--output', 'tsv',
  '--only-show-errors'
], { redactOutput: true });
const senderDomain = runCli('az', [
  'rest',
  '--method', 'GET',
  '--url', `${emailDomainUrl}?api-version=2025-09-01`,
  '--query', 'properties.fromSenderDomain',
  '--output', 'tsv',
  '--only-show-errors'
]);

if (!aiKey || !searchKey || !acsConnectionString || !senderDomain) {
  throw new Error('Azure returned an empty AI key, Search key, ACS connection string, or managed email domain.');
}

const source = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : fs.readFileSync(examplePath, 'utf8');
const updates = {
  AI_API_KEY: aiKey,
  AI_ENDPOINT: aiEndpoint,
  AI_MODEL: values.AI_MODEL || 'gpt-5-mini',
  AI_EMBEDDING_MODEL: values.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
  AZURE_AI_SEARCH_ENDPOINT: searchEndpoint,
  AZURE_AI_SEARCH_KEY: searchKey,
  AZURE_AI_SEARCH_INDEX: 'customer-documents-index',
  AZURE_AI_SEARCH_KNOWLEDGE_SOURCE: 'customer-documents-ks',
  AZURE_AI_SEARCH_KNOWLEDGE_BASE: 'customer-documents-kb',
  ENTRAID_TENANT_ID: entraTenantId,
  ENTRAID_CLIENT_ID: entraSpaAppId,
  ENTRAID_API_CLIENT_ID: entraApiAppId,
  ENTRAID_API_SCOPE: entraApiScope,
  ACS_CONNECTION_STRING: acsConnectionString,
  ACS_EMAIL_ADDRESS: `donotreply@${senderDomain}`,
  ...phoneConfigurationForResource(source, communicationServiceName)
};

const temporaryPath = `${envPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, updateEnvironmentText(source, updates), { mode: 0o600 });
fs.renameSync(temporaryPath, envPath);
fs.chmodSync(envPath, 0o600);
console.log('Updated the ignored root .env with Entra, Azure AI, Search, and ACS email settings. Secret values were not printed.');
console.log(`Phone setup remains manual. Acquire the phone number from ACS resource ${communicationServiceName}, then set ACS_PHONE_NUMBER in .env.`);
