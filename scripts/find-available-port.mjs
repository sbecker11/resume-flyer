/**
 * Find an available port starting from startPort, cycling up to maxTries times.
 * Uses a temporary listen to check availability.
 * Usage: node scripts/find-available-port.mjs [startPort] [maxTries]
 * Defaults: startPort 3001, maxTries 20. Prints the port number to stdout.
 */
import net from 'net';

const startPort = parseInt(process.argv[2] || '3001', 10);
const maxTries = parseInt(process.argv[3] || '20', 10);

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            resolve(err.code === 'EADDRINUSE' ? false : false);
        });
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}

async function findAvailablePort(from, maxTriesCount) {
    for (let i = 0; i < maxTriesCount; i++) {
        const port = from + i;
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    return null;
}

const port = await findAvailablePort(startPort, maxTries);
if (port === null) {
    console.error(`No available port in range ${startPort}..${startPort + maxTries - 1}`);
    process.exit(1);
}
console.log(port);
