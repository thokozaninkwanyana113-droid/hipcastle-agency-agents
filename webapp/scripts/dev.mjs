// Runs the API (port 4000) and the Vite dev server (port 5173) together.
import { spawn } from 'node:child_process';

const run = (name, args) => {
  const p = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => { console.log(`${name} exited (${code})`); process.exit(code ?? 0); });
  return p;
};
const procs = [run('api', ['--prefix', 'server', 'run', 'dev']), run('web', ['--prefix', 'client', 'run', 'dev'])];
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
