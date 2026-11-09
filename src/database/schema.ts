/**
 * Current IndexedDB schema (the union of all versions in ./migrations).
 * Documentation/test helper only — the database is defined by SCHEMA_VERSIONS.
 */
import { SCHEMA_VERSIONS } from './migrations';

export { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './migrations';

/** Store definitions in effect for the latest version (later versions override earlier ones). */
export const CURRENT_STORES: Record<string, string> = SCHEMA_VERSIONS.reduce<Record<string, string>>((acc, v) => {
  for (const [table, def] of Object.entries(v.stores)) {
    if (def === null) delete acc[table];
    else acc[table] = def;
  }
  return acc;
}, {});
