import { NextFunction, Request, RequestHandler, Response } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import './config';

const REQUIRED_SCOPE = 'access_as_user';
const tenantId = process.env.ENTRAID_TENANT_ID ?? '';
const apiClientId = process.env.ENTRAID_API_CLIENT_ID ?? '';

export function validateEntraConfiguration() {
  if (!tenantId || !apiClientId) {
    throw new Error('ENTRAID_TENANT_ID and ENTRAID_API_CLIENT_ID must be configured.');
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
        tid: tenantId
      }
    });
    accessTokenValidator(req, res, next);
  }
  catch (error) {
    next(error);
  }
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

export const requireApiAuthentication: RequestHandler[] = [validateAccessToken, requireAccessAsUser];

export function handleAuthenticationError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  const authError = error as { status?: number; headers?: Record<string, string> };
  if (authError?.status !== 401) {
    next(error);
    return;
  }

  const challenge = authError.headers?.['WWW-Authenticate'] ?? authError.headers?.['www-authenticate'];
  if (challenge) res.setHeader('WWW-Authenticate', challenge);
  res.status(401).json({ error: 'A valid Microsoft Entra access token is required.' });
}
