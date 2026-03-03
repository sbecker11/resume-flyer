/**
 * Open the dev app in the system browser. Reads VITE_DEV_PORT from .env (see docs/REPLICATE-PORTS-CONFIG.md).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const port = parseInt(process.env.VITE_DEV_PORT, 10) || 5174;
const url = `http://localhost:${port}`;
spawn('npx', ['open-cli', url], { cwd: root, stdio: 'inherit', shell: true });
