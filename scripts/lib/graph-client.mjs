export function acquireGraphToken({ tenantId, runCli }) {
  const tokenArgs = [
    'account', 'get-access-token', '--tenant', tenantId, '--resource-type', 'ms-graph',
    '--query', 'accessToken', '--output', 'tsv', '--only-show-errors'
  ];
  try {
    return runCli('az', tokenArgs, { redactOutput: true });
  } catch {
    const original = JSON.parse(runCli('az', ['account', 'show', '--output', 'json']));
    const accounts = JSON.parse(runCli('az', ['account', 'list', '--all', '--output', 'json']));
    const tenantAccount = accounts.find(account => account.tenantId === tenantId && account.state === 'Enabled');
    if (!tenantAccount) throw new Error(`Azure CLI has no enabled cached account for Entra tenant ${tenantId}.`);
    try {
      runCli('az', ['account', 'set', '--subscription', tenantAccount.id]);
      return runCli('az', tokenArgs, { redactOutput: true });
    } finally {
      runCli('az', ['account', 'set', '--subscription', original.id]);
    }
  }
}

export async function createGraphClient({ tenantId, runCli, fetchImpl = fetch }) {
  const token = acquireGraphToken({ tenantId, runCli });
  if (!token) throw new Error(`Azure CLI did not return a Microsoft Graph token for tenant ${tenantId}.`);

  return async function graph(method, path, body) {
    const response = await fetchImpl(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) {
      const requestId = response.headers.get('request-id') || response.headers.get('client-request-id');
      let detail = '';
      try {
        const errorBody = await response.json();
        const code = String(errorBody?.error?.code || '').replace(/[^A-Za-z0-9_.-]/g, '');
        const message = String(errorBody?.error?.message || '').replace(/[\r\n]+/g, ' ').slice(0, 500);
        detail = [code, message].filter(Boolean).join(': ');
      } catch {
        // Keep failures free of response bodies that may contain sensitive data.
      }
      const error = new Error(`Microsoft Graph ${method} ${path.split('?')[0]} failed with status ${response.status}${detail ? `: ${detail}` : ''}${requestId ? ` (request ${requestId})` : ''}.`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
}
