// In-memory brute-force limiter: 5 failures per username within 15 minutes locks that
// username for the rest of the window. Single-instance deployment, so no shared store needed;
// a restart clears it.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

export function isLocked(username: string) {
  const f = failures.get(username);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { failures.delete(username); return false; }
  return f.count >= MAX_FAILURES;
}

export function recordFailure(username: string) {
  const f = failures.get(username);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(username, { count: 1, first: Date.now() });
  else f.count++;
}

export const clearFailures = (username: string) => failures.delete(username);
