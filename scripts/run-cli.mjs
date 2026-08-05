import { spawnSync } from 'node:child_process';

const WINDOWS_RUNNER = `
$ErrorActionPreference = 'Stop'
$payload = $env:OPENAI_ACS_CLI_ARGS | ConvertFrom-Json
$command = [string]$payload[0]
$arguments = @($payload | Select-Object -Skip 1)
& $command @arguments
if (-not $?) {
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
  exit 1
}
exit $LASTEXITCODE
`;

export function runCli(command, args, options = {}) {
  const env = { ...process.env, ...options.env };
  let executable = command;
  let commandArgs = args;

  if (process.platform === 'win32') {
    env.OPENAI_ACS_CLI_ARGS = JSON.stringify([command, ...args]);
    executable = 'powershell.exe';
    commandArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_RUNNER];
  }

  const result = spawnSync(executable, commandArgs, {
    cwd: options.cwd,
    env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe'
  });

  if (result.status !== 0) {
    const detail = options.redactOutput ? '' : `\n${(result.stderr || result.stdout || '').trim()}`;
    throw new Error(`${command} exited with code ${result.status}.${detail}`);
  }

  return (result.stdout || '').trim();
}
