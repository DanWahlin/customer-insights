import { runCli } from './run-cli.mjs';

if (!process.argv.includes('--yes')) {
  throw new Error('Cleanup is destructive. Release any purchased phone number, select the intended azd environment, then re-run with --yes.');
}

const values = JSON.parse(runCli('azd', ['env', 'get-values', '--output', 'json', '--no-prompt']));
for (const key of ['AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'AZURE_ENV_NAME']) {
  if (!values[key]) throw new Error(`The selected azd environment does not contain ${key}.`);
}

runCli('azd', ['down', '--force', '--purge', '--no-prompt'], { stdio: 'inherit' });
const exists = runCli('az', [
  'group', 'exists',
  '--subscription', values.AZURE_SUBSCRIPTION_ID,
  '--name', values.AZURE_RESOURCE_GROUP
]);
if (exists !== 'false') throw new Error(`Azure resource group ${values.AZURE_RESOURCE_GROUP} still exists; refusing further cleanup.`);

runCli('node', ['scripts/cleanup-entra.mjs', '--yes'], { stdio: 'inherit' });
runCli('azd', ['env', 'remove', values.AZURE_ENV_NAME, '--force']);
runCli('docker', ['compose', 'down'], { stdio: 'inherit' });
console.log('Customer Insights cleanup completed and the Azure resource group is absent.');
