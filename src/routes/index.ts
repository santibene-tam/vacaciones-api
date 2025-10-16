import { Router } from 'express';
import holidaysRoutes from './holidays.routes';

const router = Router();

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
router.use('/holidays', holidaysRoutes);

export default router;
