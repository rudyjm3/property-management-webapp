import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from the monorepo root. Using __dirname keeps this correct
// regardless of where the process is started from.
config({ path: resolve(__dirname, '../../../.env'), override: true });
