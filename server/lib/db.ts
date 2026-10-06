import pg from 'pg';

// Server-only database access. DATABASE_URL never reaches the browser bundle.
const { Pool, types } = pg;
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC -> number
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // BIGINT (COUNT) -> number
types.setTypeParser(1082, (v) => v); // DATE stays 'YYYY-MM-DD'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://gridiron:gridiron@localhost:5432/gridiron',
  max: Number(process.env.PG_POOL_MAX ?? 8),
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
