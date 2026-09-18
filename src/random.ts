export function randomId(bytes = 9): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

// Uniform value in [0, 1) from the CSPRNG. Used where unpredictability is the
// point — traffic-analysis jitter — rather than Math.random, whose state is
// recoverable from a few outputs.
export function randomUnitInterval(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
