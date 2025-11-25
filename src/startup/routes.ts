import { Express } from 'express';
import mongoose from 'mongoose';
import v1 from '../routes/v1';

export function setupRoutes(app: Express) {
  app.use('/api/v1', v1);

  // Liveness probe - simple OK if process is up
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness probe - ensure required dependencies (e.g., MongoDB) are ready
  app.get('/ready', (_req, res) => {
    const mongoReady = mongoose.connection.readyState === 1; // 1 = connected
    if (mongoReady) {
      return res.status(200).json({ status: 'ready' });
    }
    return res.status(503).json({
      status: 'not_ready',
      details: { mongo_connected: mongoReady },
    });
  });
}
