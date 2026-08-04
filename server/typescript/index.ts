import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import apiRoutes from './apiRoutes';
import './config';

const app = express();
const port = Number(process.env.API_PORT || 3000);
const host = process.env.API_HOST || '127.0.0.1';
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:4200')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// Middleware to block specific file types
app.use((req: Request, res: Response, next: NextFunction): void => {
  const fileExtension = path.extname(req.url);
  if (fileExtension === '.schema') {
    res.status(403).send('Access to this file is forbidden.');
    return;
  }
  next();
});

app.use('/api', apiRoutes);
app.get('/api/health', (_req, res): void => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`API listening at http://${host}:${port}`);
  });
}

export { app };