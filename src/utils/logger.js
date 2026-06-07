/**
 * logger.js — Frontend structured logger
 *
 * Mirrors the backend log format in the browser console with colors.
 * Also maintains an in-memory ring buffer so the Upload page can render a live log panel.
 *
 * Usage:
 *   import logger from '../utils/logger';
 *   logger.info('Upload', 'File selected', { name: file.name, size: file.size });
 *   logger.debug('Worker', 'Compression progress', { pct: 40 });
 *   logger.error('API', 'Upload failed', err);
 *
 * Subscribers (e.g. React state setters) can be registered via logger.subscribe(fn).
 */

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// Ring buffer — keeps the last MAX_ENTRIES log lines for the UI panel
const MAX_ENTRIES = 200;
let _entries = [];
let _subscribers = [];

// Console colour styles
const STYLES = {
  DEBUG: 'color:#94a3b8;font-weight:400',
  INFO:  'color:#38bdf8;font-weight:600',
  WARN:  'color:#fbbf24;font-weight:600',
  ERROR: 'color:#f87171;font-weight:700',
};

function _pad(n, w = 2) { return String(n).padStart(w, '0'); }

function _timestamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())} ` +
    `${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}.${_pad(d.getMilliseconds(), 3)}`
  );
}

function _log(level, module, message, data) {
  const ts = _timestamp();
  const label = level.padEnd(5);

  // Console output with colours
  const meta = data !== undefined
    ? (data instanceof Error ? data : JSON.stringify(data, null, 0))
    : '';
  console.log(
    `%c[${ts}] [${label}] [${module}] ${message}`,
    STYLES[level],
    meta || ''
  );

  // Add to ring buffer
  const entry = { ts, level, module, message, data, id: Date.now() + Math.random() };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();

  // Notify subscribers
  _subscribers.forEach(fn => fn([..._entries]));
}

const logger = {
  debug: (module, message, data) => _log('DEBUG', module, message, data),
  info:  (module, message, data) => _log('INFO',  module, message, data),
  warn:  (module, message, data) => _log('WARN',  module, message, data),
  error: (module, message, data) => _log('ERROR', module, message, data),

  /** Register a callback that fires with the full entries array on every new log line. */
  subscribe(fn) {
    _subscribers.push(fn);
    // Immediately call with current buffer so the UI can hydrate
    fn([..._entries]);
    return () => { _subscribers = _subscribers.filter(s => s !== fn); };
  },

  /** Clear the ring buffer and notify subscribers. */
  clear() {
    _entries = [];
    _subscribers.forEach(fn => fn([]));
  },

  getEntries() { return [..._entries]; },
};

export default logger;
