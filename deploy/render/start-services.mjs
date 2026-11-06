import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createServices } from './service-config.mjs';
import { supervise } from './supervisor.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

try {
  const services = createServices(process.env, root);
  for (const service of services) {
    await access(join(service.cwd, 'dist/main.js'));
    // Reuse each application's validation before starting any process.
    try {
      require(join(service.cwd, 'dist/config/env.validation.js')).validateEnv(service.env);
    } catch {
      throw new Error(`Invalid configuration for ${service.name}; check its environment variable reference`);
    }
  }
  if (process.argv.includes('--check')) {
    console.log('Configuration and build entrypoints validated for five services. No connections opened.');
  } else {
    const running = supervise(services);
    const onSignal = () => running.stop();
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    process.exitCode = await running.finished;
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
  }
} catch (error) {
  console.error(`[startup] ${error.message}`);
  process.exitCode = 1;
}
