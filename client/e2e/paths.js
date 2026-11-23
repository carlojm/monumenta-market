import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Where global-setup.js builds the site for the browser tests (gitignored).
// Not a dot folder: Express won't send files from inside one.
export const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build');
