export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${message}`;
  if (data) {
    console[level === 'ERROR' ? 'error' : 'log'](line, data);
  } else {
    console[level === 'ERROR' ? 'error' : 'log'](line);
  }
}
