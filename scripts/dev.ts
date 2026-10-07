// Development: rebuilds the server on change and restarts it, next to the Vite dev server for the client. CLIENT_PORT (default 5173) is strict, because login links point at it.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const clientPort = process.env.CLIENT_PORT ?? '5173';
const env = { ...process.env, APP_MODUS: 'development', BASIS_URL: `http://localhost:${clientPort}` };
const kinderen: ChildProcess[] = [];

function start(naam: string, cmd: string, args: string[]): ChildProcess {
  const p = spawn(cmd, args, { stdio: 'inherit', env });
  p.on('exit', (code) => {
    console.error(`[dev] ${naam} stopte (code ${code})`);
    stop(1);
  });
  kinderen.push(p);
  return p;
}

function stop(code: number): never {
  for (const p of kinderen) p.kill();
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

rmSync('dist/server/main.js', { force: true });
start('server-build', 'npx', ['vite', 'build', '--watch', '-c', 'vite.server.config.ts']);
while (!existsSync('dist/server/main.js')) await new Promise((r) => setTimeout(r, 200));
start('server', 'node', ['--watch-path=dist/server', 'dist/server/main.js']);
start('client', 'npx', ['vite', '--port', clientPort, '--strictPort']);
