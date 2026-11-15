import { createApp } from './app.js';
import { seed } from './seed.js';
import { startScheduler } from './jobs.js';
import { logEvent } from './events.js';

// Every boot: import agents and insert any missing catalog entries. Existing prices and copy
// edited in the Command Centre are kept (use `npm run seed -- --sync-catalog` to reset them).
seed({ demo: process.env.SEED_DEMO !== 'false' });
startScheduler();

const port = Number(process.env.PORT) || 4000;
createApp().listen(port, () => {
  console.log(`Hipcastle listening on http://localhost:${port}`);
  logEvent('system.start', `Server started on port ${port} (${process.env.NODE_ENV || 'development'})`);
});
