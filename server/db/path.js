import path from 'path';
import { fileURLToPath } from 'url';

// Where the database lives: DB_PATH (on Fly, /data/market.db) or server/market.db.
// Its own file so scripts can find the database without opening it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dbPath = process.env.DB_PATH || path.join(__dirname, '../market.db');
