export async function createGraphClient({ tenantId, runCli, fetchImpl = fetch }) {
  const token = runCli('az', [
    'account', 'get-access-token',
    '--tenant', tenantId,
    '--resource-type', 'ms-graph',
    '--query', 'accessToken',
    '--output', 'tsv',
    '--only-show-errors'
  ], { redactOutput: true });
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
      throw new Error(`Microsoft Graph ${method} ${path.split('?')[0]} failed with status ${response.status}${requestId ? ` (request ${requestId})` : ''}.`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
}
