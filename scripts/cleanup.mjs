import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './run-cli.mjs';
import { updateEnvironmentText } from './lib/env-file.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const expectedIndex = args.indexOf('--environment');
const expectedEnvironment = expectedIndex >= 0 ? args[expectedIndex + 1] : '';
if (!args.includes('--yes') || !expectedEnvironment) {
  throw new Error('Cleanup is destructive. Re-run with --yes --environment <exact-azd-environment-name> after releasing any purchased phone number.');
}
if (!/^[a-zA-Z0-9._-]+$/.test(expectedEnvironment)) throw new Error('The environment name contains unsupported characters.');

const manifestDirectory = path.join(repositoryRoot, '.azure', expectedEnvironment);
const manifestPath = path.join(manifestDirectory, 'customer-insights-cleanup.json');
let values;
if (fs.existsSync(manifestPath)) {
  values = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} else {
  values = JSON.parse(runCli('azd', ['env', 'get-values', '--environment', expectedEnvironment, '--output', 'json', '--no-prompt'], { cwd: repositoryRoot }));
  for (const key of ['AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'AZURE_ENV_NAME']) {
    if (!values[key]) throw new Error(`The selected azd environment does not contain ${key}.`);
  }
  if (values.AZURE_ENV_NAME !== expectedEnvironment) throw new Error('The selected azd environment does not match --environment.');
  fs.mkdirSync(manifestDirectory, { recursive: true, mode: 0o700 });
  const temporaryManifestPath = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryManifestPath, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
  JSON.parse(fs.readFileSync(temporaryManifestPath, 'utf8'));
  fs.renameSync(temporaryManifestPath, manifestPath);
}
if (values.AZURE_ENV_NAME !== expectedEnvironment) throw new Error('The cleanup manifest does not match --environment.');

console.log(`Cleanup target: environment=${values.AZURE_ENV_NAME} subscription=${values.AZURE_SUBSCRIPTION_ID} resourceGroup=${values.AZURE_RESOURCE_GROUP}`);
const groupExists = () => runCli('az', [
  'group', 'exists', '--subscription', values.AZURE_SUBSCRIPTION_ID, '--name', values.AZURE_RESOURCE_GROUP
], { cwd: repositoryRoot });
if (groupExists() !== 'false') {
  runCli('azd', ['down', '--environment', expectedEnvironment, '--force', '--purge', '--no-prompt'], { cwd: repositoryRoot, stdio: 'inherit' });
}
if (groupExists() !== 'false') throw new Error(`Azure resource group ${values.AZURE_RESOURCE_GROUP} still exists; refusing further cleanup.`);

const hasEntraCleanupHandle = (values.ENTRA_TENANT_ID || values.AZURE_TENANT_ID) && (values.ENTRA_SPA_APP_ID || values.ENTRA_API_APP_ID);
if (hasEntraCleanupHandle) {
  runCli('node', ['scripts/cleanup-entra.mjs', '--yes', '--manifest', manifestPath], { cwd: repositoryRoot, stdio: 'inherit' });
} else {
  console.warn('Azure cleanup succeeded, but no complete Entra cleanup handle was stored. Remove any partially created Customer Insights app registrations manually.');
}
const localEnvironmentPath = process.env.CUSTOMER_INSIGHTS_LOCAL_ENV_PATH || path.join(repositoryRoot, '.env');
if (fs.existsSync(localEnvironmentPath)) {
  const localEnvironmentSource = fs.readFileSync(localEnvironmentPath, 'utf8');
  const localOwner = localEnvironmentSource.split(/\r?\n/).find(line => line.startsWith('CUSTOMER_INSIGHTS_AZD_ENVIRONMENT='))?.split('=', 2)[1] ?? '';
  if (localOwner === expectedEnvironment) {
  const cleared = Object.fromEntries([
    'ENTRAID_CLIENT_ID', 'ENTRAID_TENANT_ID', 'ENTRAID_API_CLIENT_ID', 'ENTRAID_API_SCOPE',
    'AI_API_KEY', 'AI_ENDPOINT', 'AI_MODEL', 'AI_EMBEDDING_MODEL',
    'AZURE_AI_SEARCH_ENDPOINT', 'AZURE_AI_SEARCH_KEY', 'AZURE_AI_SEARCH_SERVICE_NAME',
    'ACS_CONNECTION_STRING', 'ACS_PHONE_NUMBER', 'ACS_PHONE_NUMBER_RESOURCE', 'ACS_EMAIL_ADDRESS'
  ].map(key => [key, '']));
  const temporaryPath = `${localEnvironmentPath}.cleanup-${process.pid}`;
  fs.writeFileSync(temporaryPath, updateEnvironmentText(localEnvironmentSource, { ...cleared, CUSTOMER_INSIGHTS_AZD_ENVIRONMENT: '' }), { mode: 0o600 });
  fs.renameSync(temporaryPath, localEnvironmentPath);
  }
}
runCli('azd', ['env', 'remove', expectedEnvironment, '--force'], { cwd: repositoryRoot });
try {
  runCli('docker', ['compose', 'down'], { cwd: repositoryRoot, stdio: 'inherit' });
} catch (error) {
  console.warn(`Cloud cleanup completed, but local Compose shutdown failed: ${error instanceof Error ? error.message : error}`);
}
console.log('Customer Insights cleanup completed and the Azure resource group is absent.');
