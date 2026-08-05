import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './run-cli.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const envPath = path.join(repositoryRoot, '.env');
const examplePath = path.join(repositoryRoot, '.env.example');

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

function requireValue(values, key) {
  const value = values[key]?.trim();
  if (!value) throw new Error(`The selected azd environment does not contain ${key}. Run azd provision first.`);
  return value;
}

function updateEnvironmentFile(source, updates) {
  const remaining = new Map(Object.entries(updates));
  const lines = source.split(/\r?\n/).map(line => {
    if (!line || line.trimStart().startsWith('#')) return line;
    const separator = line.indexOf('=');
    if (separator < 1) return line;
    const key = line.slice(0, separator).trim();
    if (!remaining.has(key)) return line;
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });

  while (lines.length && lines.at(-1) === '') lines.pop();
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return `${lines.join('\n')}\n`;
}

const values = parseAzdValues(runCli('azd', ['env', 'get-values', '--no-prompt']));
const resourceGroup = requireValue(values, 'AZURE_RESOURCE_GROUP');
const aiAccountName = requireValue(values, 'AI_ACCOUNT_NAME');
const searchServiceName = requireValue(values, 'AZURE_AI_SEARCH_SERVICE_NAME');
const aiEndpoint = values.AI_ENDPOINT || `https://${aiAccountName}.openai.azure.com/`;
const searchEndpoint = values.AZURE_AI_SEARCH_ENDPOINT || `https://${searchServiceName}.search.windows.net`;

const aiKey = runCli('az', [
  'cognitiveservices', 'account', 'keys', 'list',
  '--resource-group', resourceGroup,
  '--name', aiAccountName,
  '--query', 'key1',
  '--output', 'tsv',
  '--only-show-errors'
], { redactOutput: true });
const searchKey = runCli('az', [
  'search', 'admin-key', 'show',
  '--resource-group', resourceGroup,
  '--service-name', searchServiceName,
  '--query', 'primaryKey',
  '--output', 'tsv',
  '--only-show-errors'
], { redactOutput: true });

if (!aiKey || !searchKey) throw new Error('Azure returned an empty AI or Search key.');

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
  AZURE_AI_SEARCH_KNOWLEDGE_BASE: 'customer-documents-kb'
};

fs.writeFileSync(envPath, updateEnvironmentFile(source, updates), { mode: 0o600 });
fs.chmodSync(envPath, 0o600);
console.log('Updated the ignored root .env with Azure AI and Search settings. Secret values were not printed.');
