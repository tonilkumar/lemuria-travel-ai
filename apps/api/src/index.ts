import { env } from './config/env.js';
import { closeDb } from './db/client.js';
import { logger } from './lib/logger.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const app = await buildServer();

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  logger.info(`Lemuria API listening on ${env.API_URL}`);

  // Drain in-flight requests before closing the pool, so a deploy does not
  // abort a request mid-transaction.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await closeDb();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
