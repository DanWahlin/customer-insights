import { NextFunction, Request, RequestHandler, Response } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import './config';

const REQUIRED_SCOPE = 'access_as_user';
const tenantId = process.env.ENTRAID_TENANT_ID?.trim() ?? '';
const apiClientId = process.env.ENTRAID_API_CLIENT_ID?.trim() ?? '';
const spaClientId = process.env.ENTRAID_CLIENT_ID?.trim() ?? '';

export function validateEntraConfiguration() {
  if (!tenantId || !apiClientId || !spaClientId) {
    throw new Error('ENTRAID_TENANT_ID, ENTRAID_API_CLIENT_ID, and ENTRAID_CLIENT_ID must be configured.');
  }
}

let accessTokenValidator: RequestHandler | undefined;

const validateAccessToken: RequestHandler = (req, res, next): void => {
  try {
    validateEntraConfiguration();
    accessTokenValidator ??= auth({
      issuerBaseURL: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      audience: apiClientId,
      tokenSigningAlg: 'RS256',
      validators: {
        tid: tenantId,
        azp: spaClientId
      }
    });
    accessTokenValidator(req, res, next);
  }
  catch (error) {
    next(error);
  }
};

export const requireBearerHeader: RequestHandler = (req, res, next): void => {
  const authorization = req.headers.authorization;
  const hasAlternateToken = typeof req.query.access_token !== 'undefined' ||
    (typeof req.body === 'object' && req.body !== null && 'access_token' in req.body);

  if (hasAlternateToken || typeof authorization !== 'string' || !/^Bearer [^\s]+$/i.test(authorization)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'A valid Microsoft Entra access token is required.' });
    return;
  }

  next();
};

export function hasRequiredScope(scopeClaim: unknown): boolean {
  if (typeof scopeClaim !== 'string') return false;
  return scopeClaim.split(/\s+/).includes(REQUIRED_SCOPE);
}

export const requireAccessAsUser: RequestHandler = (req, res, next): void => {
  if (!hasRequiredScope(req.auth?.payload.scp)) {
    res.status(403).json({ error: 'The access token does not include the required API scope.' });
    return;
  }
  next();
};

export const requireApiAuthentication: RequestHandler[] = [requireBearerHeader, validateAccessToken, requireAccessAsUser];

export function handleAuthenticationError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  const authError = error as { status?: number; headers?: Record<string, string>; message?: string };
  const isClaimValidationError = authError instanceof Error && /^Unexpected '(tid|azp)' value$/.test(authError.message);
  if (authError?.status !== 400 && authError?.status !== 401 && !isClaimValidationError) {
    next(error);
    return;
  }

  const challenge = (error as { headers?: Record<string, string> }).headers?.['WWW-Authenticate'] ??
    (error as { headers?: Record<string, string> }).headers?.['www-authenticate'];
  if (challenge) res.setHeader('WWW-Authenticate', challenge);
  res.status(401).json({ error: 'A valid Microsoft Entra access token is required.' });
}
