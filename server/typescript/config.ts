import path from 'node:path';
import dotenv from 'dotenv';

const levelsToRoot = path.basename(__dirname) === 'dist' ? '../../../.env' : '../../.env';
dotenv.config({
  path: path.resolve(__dirname, levelsToRoot),
  quiet: true
});
