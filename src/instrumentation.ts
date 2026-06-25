export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startSyncLoop } = require('./lib/syncLoop');
    startSyncLoop();
  }
}
