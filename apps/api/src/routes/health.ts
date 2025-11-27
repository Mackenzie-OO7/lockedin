import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});
