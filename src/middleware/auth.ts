import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import config from '../config';
import logger from '../utils/logger';
import { UserTokenPayload } from '../types';

const client = new OAuth2Client(config.googleClientId);

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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
    };

    logger.info({ email: req.user.email }, 'User authenticated');
    next();
  } catch (error) {
    logger.error({ error }, 'Authentication error');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
