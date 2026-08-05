import { createHash } from 'node:crypto';
import { runCli } from './run-cli.mjs';

function parseAzdValues(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const separator = line.indexOf('=');
    if (separator < 1) return [];
    const key = line.slice(0, separator);
    const rawValue = line.slice(separator + 1);
    try {
      return [[key, JSON.parse(rawValue)]];
    } catch {
      return [[key, rawValue.replace(/^"|"$/g, '')]];
    }
  }));
}

function safeEnvironmentName(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!normalized) throw new Error('AZURE_ENV_NAME must contain at least one letter or number.');
  return normalized;
}

const values = parseAzdValues(runCli('azd', ['env', 'get-values', '--no-prompt']));
const environmentName = safeEnvironmentName(values.AZURE_ENV_NAME || '');
const resourceNamePrefix = environmentName.slice(0, 20);
const subscriptionId = values.AZURE_SUBSCRIPTION_ID;
const location = values.AZURE_LOCATION || 'southcentralus';
if (!subscriptionId) {
  throw new Error('Set AZURE_SUBSCRIPTION_ID with azd env set before preparing resource names.');
}

const suffix = createHash('sha256').update(`${subscriptionId}:${environmentName}`).digest('hex').slice(0, 8);
const defaults = {
  AZURE_LOCATION: location,
  AZURE_RESOURCE_GROUP: `rg-ai-acs-orgdata-${resourceNamePrefix}-${suffix}`,
  AI_ACCOUNT_NAME: `ai-acs-orgdata-${suffix}`,
  AI_PROJECT_NAME: 'proj-ai-acs-orgdata',
  AZURE_AI_SEARCH_SERVICE_NAME: `srch-ai-acs-orgdata-${suffix}`
};

for (const [key, defaultValue] of Object.entries(defaults)) {
  if (!values[key]) {
    runCli('azd', ['env', 'set', key, defaultValue, '--no-prompt']);
    values[key] = defaultValue;
  }
}

console.log('Prepared azd environment:');
for (const key of ['AZURE_RESOURCE_GROUP', 'AZURE_LOCATION', 'AI_ACCOUNT_NAME', 'AI_PROJECT_NAME', 'AZURE_AI_SEARCH_SERVICE_NAME']) {
  console.log(`  ${key}=${values[key]}`);
}
