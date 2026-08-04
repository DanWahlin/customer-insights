import express from 'express';
import cors from 'cors';
import apiRoutes from './apiRoutes';
import { initializeDb } from './initDatabase';
import './config';

const app = express();
const port = Number(process.env.API_PORT || 3000);
const host = process.env.API_HOST || '127.0.0.1';
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:4200')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
let databaseReady = false;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

app.use('/api', apiRoutes);
app.get('/api/health', (_req, res): void => {
  res.status(databaseReady ? 200 : 503).json({ status: databaseReady ? 'ok' : 'starting' });
});

if (require.main === module) {
  initializeDb()
    .then(() => {
      databaseReady = true;
      app.listen(port, host, () => {
        console.log(`API listening at http://${host}:${port}`);
      });
    })
    .catch(error => {
      console.error('Database initialization failed:', error);
      process.exitCode = 1;
    });
}

export { app };