import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import config from './config';
import logger from './utils/logger';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Middleware
app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(pinoHttp({ logger }));

// Routes
app.use('/api', routes);

// Error handler (must be last)
app.use(errorHandler);

const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
  logger.info(`Allowed origins: ${config.allowedOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
