import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function fakeD1(): any {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, params: unknown[] = []): any => ({
    bind: (...p: unknown[]) => stmt(sql, p),
    run: async () => ({ results: [], meta: { last_row_id: Number(db.prepare(sql).run(...(params as any[])).lastInsertRowid) } }),
    all: async () => ({ results: db.prepare(sql).all(...(params as any[])), meta: {} }),
    first: async () => db.prepare(sql).get(...(params as any[])) ?? null,
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (ss: any[]) => {
      db.exec('BEGIN');
      try { const out = []; for (const s of ss) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    raw: db,
  };
}
