import { createApp } from './app.js';
import { seed } from './seed.js';
import { startScheduler } from './jobs.js';
import { logEvent } from './events.js';
import { db } from './db.js';

// Every boot: import agents and insert any missing catalog entries. Existing prices and copy
// edited in the Command Centre are kept (use `npm run seed -- --sync-catalog` to reset them).
seed({ demo: process.env.SEED_DEMO !== 'false' });
startScheduler();

const port = Number(process.env.PORT) || 4000;
const server = createApp().listen(port, () => {
  console.log(`Hipcastle listening on http://localhost:${port}`);
  logEvent('system.start', `Server started on port ${port} (${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown: stop accepting requests, let in-flight ones finish, then close the database.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received — shutting down`);
    try { logEvent('system.stop', `Server stopping (${signal})`); } catch { /* ignore */ }
    const force = setTimeout(() => process.exit(0), 8000);
    force.unref();
    server.close(() => {
      try { db.close(); } catch { /* ignore */ }
      process.exit(0);
    });
  });
}
