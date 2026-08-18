import { readDefaultMode, resolveSessionMode } from '../node_modules/@dietrichgebert/ponytail/pi-extension/index.js';

const PONYTAIL_MODE_TYPE = 'ponytail-mode';

function entriesFor(ctx) {
  const branch = typeof ctx?.sessionManager?.getBranch === 'function'
    ? ctx.sessionManager.getBranch()
    : typeof ctx?.sessionManager?.getEntries === 'function'
      ? ctx.sessionManager.getEntries()
      : [];
  return Array.isArray(branch) ? branch : [];
}

function hasPersistedMode(entries) {
  return entries.some((entry) => entry?.type === 'custom' && entry?.customType === PONYTAIL_MODE_TYPE);
}

export default function specRailPonytailBridge(pi) {
  pi.on('session_start', async (_event, ctx) => {
    const entries = entriesFor(ctx);
    if (hasPersistedMode(entries)) return;
    const mode = resolveSessionMode(entries, readDefaultMode());
    if (!['off', 'lite', 'full', 'ultra'].includes(mode)) return;
    pi.appendEntry(PONYTAIL_MODE_TYPE, {
      mode,
      source: 'specrail-official-ponytail-default-bridge',
    });
  });
}
