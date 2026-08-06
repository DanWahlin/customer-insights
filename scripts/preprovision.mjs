import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './run-cli.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
runCli('node', ['scripts/prepare-azd-env.mjs'], { cwd: repositoryRoot, stdio: 'inherit' });
runCli('node', ['scripts/preflight.mjs'], { cwd: repositoryRoot, stdio: 'inherit' });
