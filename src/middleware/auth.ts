import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import config from '../config';
import logger from '../utils/logger';
import { UserTokenPayload } from '../types';

const client = new OAuth2Client(config.googleClientId);

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

/**
 * Authenticate using API key (for AI agents)
 * API key should be passed in the Authorization header as "Bearer <api_key>"
 * Or in the x-api-key header
 */
async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<boolean> {
  // Check for API key in x-api-key header
  let apiKey = req.headers['x-api-key'] as string;

  // If not found, check Authorization header for API key format
  if (!apiKey) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Check if it's an API key (not a JWT which contains dots)
      if (!token.includes('.')) {
        apiKey = token;
      }
    }
  }

  if (!apiKey) {
    return false; // No API key found
  }

  // Validate the API key
  if (!config.apiKeys.includes(apiKey)) {
    res.status(401).json({ error: 'Invalid API key' });
    throw new Error('Invalid API key'); // Stop execution
  }

  // API key is valid - set a generic user for AI agent
  req.user = {
    email: 'ai-agent@system',
    name: 'AI Agent',
    sub: 'api-key',
    isApiKey: true,
  };

  logger.info({ type: 'api-key' }, 'AI Agent authenticated via API key');
  next();
  return true;
}

/**
 * Authenticate using Google JWT token (for regular users)
 */
async function authenticateJWT(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);

  // Verify the token with Google
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    res.status(401).json({ error: 'Invalid token payload' });
    return;
  }

  // Attach user information to request
  req.user = {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
    isApiKey: false,
  };

  logger.info({ email: req.user.email }, 'User authenticated via JWT');
  next();
}

/**
 * Main authentication middleware
 * Supports both API key and JWT authentication
 * API key is checked first, then falls back to JWT
 */
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First, try API key authentication
    const apiKeyHandled = await authenticateApiKey(req, res, next);
    if (apiKeyHandled) {
      return; // API key authentication succeeded
    }

    // Fall back to JWT authentication
    await authenticateJWT(req, res, next);
  } catch (error) {
    // Only log and respond if we haven't already sent a response
    if (!res.headersSent) {
      logger.error({ error }, 'Authentication error');
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
}

/**
 * Middleware that ONLY accepts API key authentication
 * Use this for endpoints that should only be accessible by AI agents
 */
export async function authenticateApiKeyOnly(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authenticateApiKey(req, res, next);
  } catch (error) {
    if (!res.headersSent) {
      logger.error({ error }, 'API key authentication error');
      res.status(401).json({ error: 'Valid API key required' });
    }
  }
}
