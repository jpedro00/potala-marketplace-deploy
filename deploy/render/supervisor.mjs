import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Owns direct Node children; resolves only after every child has closed. */
export function supervise(services, { graceMs = 10000, log = console.log } = {}) {
  const children = [];
  const active = new Set();
  let stopping = false;
  let result = 0;
  let timer;
  let resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });

  function completeIfStopped() {
    if (stopping && active.size === 0) {
      clearTimeout(timer);
      resolveFinished(result);
    }
  }

  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    result = code;
    for (const child of active) child.kill('SIGTERM');
    timer = setTimeout(() => {
      for (const child of active) child.kill('SIGKILL');
    }, graceMs);
    completeIfStopped();
  }

  for (const service of services) {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd, env: service.env, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    active.add(child);
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', line => log(`[${service.name}] ${line}`));
    }
    child.on('error', () => {
      log(`[${service.name}] Failed to start`);
      stop(1);
    });
    child.on('close', (code, signal) => {
      active.delete(child);
      if (!stopping) {
        log(`[${service.name}] Unexpected exit (${signal ?? code})`);
        stop(1);
      }
      completeIfStopped();
    });
  }
  if (services.length === 0) stop(1);
  return { children, finished, stop };
}
