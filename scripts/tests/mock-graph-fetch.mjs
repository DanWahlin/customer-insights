import fs from 'node:fs';

const statePath = process.env.MOCK_STATE;
if (!statePath) throw new Error('MOCK_STATE is required.');

const jsonResponse = (value, status = 200) => new Response(
  value == null ? null : JSON.stringify(value),
  { status, headers: { 'Content-Type': 'application/json' } }
);

const save = state => fs.writeFileSync(statePath, JSON.stringify(state));

globalThis.fetch = async (rawUrl, options = {}) => {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const url = new URL(rawUrl);
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  const resource = url.pathname.replace('/v1.0/', '');
  const filter = decodeURIComponent(url.searchParams.get('$filter') || '');
  state.requests.push({ method, resource, filter, body });

  if (method === 'GET' && resource === 'applications') {
    const appId = filter.match(/appId eq '([^']+)'/)?.[1];
    const displayName = filter.match(/displayName eq '([^']+)'/)?.[1];
    return jsonResponse({ value: state.apps.filter(app => app.appId === appId || app.displayName === displayName) });
  }
  if (method === 'GET' && resource.startsWith('applications/')) {
    const app = state.apps.find(item => item.id === resource.split('/')[1]);
    return app ? jsonResponse(app) : jsonResponse({ error: { code: 'Request_ResourceNotFound' } }, 404);
  }
  if (method === 'POST' && resource === 'applications') {
    const index = state.apps.length + 1;
    const app = { id: `object-${index}`, appId: `app-${index}`, ...body };
    state.apps.push(app); save(state); return jsonResponse(app, 201);
  }
  if (method === 'PATCH' && resource.startsWith('applications/')) {
    const app = state.apps.find(item => item.id === resource.split('/')[1]);
    Object.assign(app, body); save(state); return jsonResponse(null, 204);
  }
  if (method === 'DELETE' && resource.startsWith('applications/')) {
    const id = resource.split('/')[1];
    const deleted = state.apps.find(item => item.id === id);
    state.apps = state.apps.filter(item => item.id !== id);
    if (deleted) state.servicePrincipals = state.servicePrincipals.filter(item => item.appId !== deleted.appId);
    save(state); return jsonResponse(null, 204);
  }
  if (method === 'GET' && resource === 'servicePrincipals') {
    const appId = filter.match(/appId eq '([^']+)'/)?.[1];
    return jsonResponse({ value: state.servicePrincipals.filter(sp => sp.appId === appId) });
  }
  if (method === 'POST' && resource === 'servicePrincipals') {
    const sp = { id: `sp-${body.appId}`, appId: body.appId };
    state.servicePrincipals.push(sp); save(state); return jsonResponse(sp, 201);
  }
  if (method === 'GET' && resource === 'oauth2PermissionGrants') {
    const clientId = filter.match(/clientId eq '([^']+)'/)?.[1];
    const resourceId = filter.match(/resourceId eq '([^']+)'/)?.[1];
    return jsonResponse({ value: state.grants.filter(grant => grant.clientId === clientId && grant.resourceId === resourceId) });
  }
  if (method === 'POST' && resource === 'oauth2PermissionGrants') {
    const grant = { id: `grant-${state.grants.length + 1}`, ...body };
    state.grants.push(grant); save(state); return jsonResponse(grant, 201);
  }
  if (method === 'PATCH' && resource.startsWith('oauth2PermissionGrants/')) {
    const grant = state.grants.find(item => item.id === resource.split('/')[1]);
    Object.assign(grant, body); save(state); return jsonResponse(null, 204);
  }
  return jsonResponse({ error: 'Unhandled mock Graph request' }, 500);
};
