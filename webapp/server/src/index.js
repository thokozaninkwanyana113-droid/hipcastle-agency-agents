import { createApp } from './app.js';
import { seed } from './seed.js';
import { db } from './db.js';

// First boot: populate catalog + agents automatically.
if (db.prepare('SELECT COUNT(*) n FROM services').get().n === 0) seed({ demo: process.env.SEED_DEMO !== 'false' });

const port = Number(process.env.PORT) || 4000;
createApp().listen(port, () => console.log(`Hipcastle API listening on http://localhost:${port}`));
