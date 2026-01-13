import { Router } from 'express';
import { getFeriados } from '../controllers/feriados.controller';

const router = Router();

// Public endpoint - no authentication required for calendar lookups
router.get('/', getFeriados);

export default router;
