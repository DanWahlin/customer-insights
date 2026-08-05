function parseResponsePart(value: string): URLSearchParams {
  const trimmed = value.replace(/^[?#]/, '');
  return new URLSearchParams(trimmed);
}

export function isMsalAuthenticationResponse(search: string, hash: string): boolean {
  const query = parseResponsePart(search);
  const fragment = parseResponsePart(hash);
  const hasState = query.has('state') || fragment.has('state');
  const hasResult = query.has('code') || fragment.has('code') || query.has('error') || fragment.has('error');
  return hasState && hasResult;
}
