import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  const env = { ...process.env };
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
  
  return env;
}

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test((value || '').trim());
}

export function updateEnvironment(isProd = false) {
  const env = loadEnv();
  
  // Build the environment object
  const envObject = {
    production: isProd,
    apiUrl: env.NG_APP_API_URL || '',
    ENTRAID_CLIENT_ID: env.ENTRAID_CLIENT_ID || '',
    ENTRAID_TENANT_ID: env.ENTRAID_TENANT_ID || '',
    ENTRAID_API_SCOPE: env.ENTRAID_API_SCOPE || '',
    TEAM_ID: env.TEAM_ID || '',
    CHANNEL_ID: env.CHANNEL_ID || '',
    TEAMS_ENABLED: !!(env.TEAM_ID && env.CHANNEL_ID),
    AI_ENABLED: isEnabled(env.NG_APP_AI_ENABLED) || !!(env.AI_API_KEY || env.AI_ENDPOINT),
    ACS_CONNECTION_STRING: isEnabled(env.NG_APP_ACS_ENABLED) || !!(env.ACS_CONNECTION_STRING || env.ACS_PHONE_NUMBER),
    ACS_PHONE_NUMBER: env.ACS_PHONE_NUMBER || '',
    ACS_EMAIL_ADDRESS: isEnabled(env.NG_APP_ACS_EMAIL_ENABLED) || !!env.ACS_EMAIL_ADDRESS,

    API_PORT: env.API_PORT || '',
    FOUNDRY_IQ_ENABLED: isEnabled(env.NG_APP_FOUNDRY_IQ_ENABLED) || !!(env.AZURE_AI_SEARCH_ENDPOINT && env.AZURE_AI_SEARCH_KNOWLEDGE_BASE)
  };
  
  // Generate the TypeScript content
  const entries = Object.entries(envObject).map(([key, value]) => {
    if (typeof value === 'boolean') {
      return `  ${key}: ${value}`;
    } else {
      return `  ${key}: ${JSON.stringify(String(value))}`;
    }
  });
  
  const content = `export const environment = {
${entries.join(',\n')}
};`;
  
  const envFile = isProd ? 'environment.prod.ts' : 'environment.ts';
  const envPath = path.join(__dirname, '..', 'src', 'environments', envFile);
  
  fs.writeFileSync(envPath, content);
  console.log(`Updated ${envFile}`);
}

// Run for both environments
updateEnvironment(false); // development
updateEnvironment(true);  // production