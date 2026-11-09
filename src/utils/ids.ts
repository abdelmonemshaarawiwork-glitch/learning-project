const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newId(): string {
  return crypto.randomUUID();
}

/** Human-readable patient code, e.g. "BT-7K3Q9XAB" (40 random bits, Crockford base32). */
export function generatePatientCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CROCKFORD[b % 32];
  return `BT-${out}`;
}
