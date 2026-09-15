import { initializeDb } from '../initDatabase';
import '../config';

initializeDb()
  .then(() => {
    console.log('Database initialization completed.');
  })
  .catch(error => {
    console.error('Database initialization failed:', error);
    process.exitCode = 1;
  });
