import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supervise } from '../supervisor.mjs';

function child(name, code) {
  return { name, command: process.execPath, args: ['-e', code], cwd: process.cwd(), env: {} };
}

test('unexpected exit terminates siblings and fails the deployment unit', { timeout: 10000 }, async () => {
  const running = supervise([
    child('waiting', 'setInterval(() => {}, 1000)'),
    child('failed', 'setTimeout(() => process.exit(7), 150)'),
  ], { graceMs: 100, log: () => {} });
  assert.equal(await running.finished, 1);
  for (const process of running.children) assert.ok(process.exitCode !== null || process.signalCode !== null);
});

test('normal stop terminates and collects all children', { timeout: 10000 }, async () => {
  const running = supervise([child('waiting', 'setInterval(() => {}, 1000)')], { graceMs: 100, log: () => {} });
  running.stop();
  assert.equal(await running.finished, 0);
  assert.ok(running.children[0].exitCode !== null || running.children[0].signalCode !== null);
});

test('failed spawn stops other children and resolves with failure', { timeout: 10000 }, async () => {
  const running = supervise([
    child('waiting', 'setInterval(() => {}, 1000)'),
    { ...child('missing', ''), command: 'potala-nonexistent-command' },
  ], { graceMs: 100, log: () => {} });
  assert.equal(await running.finished, 1);
});
