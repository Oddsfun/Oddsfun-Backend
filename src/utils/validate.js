export function assert(condition, msg, status = 400) {
  if (!condition) {
    const e = new Error(msg);
    e.status = status;
    throw e;
  }
}

export function parseAmountSol(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1e9) / 1e9; // clamp to 9 decimals
}
