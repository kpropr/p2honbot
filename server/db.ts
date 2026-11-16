import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  connectionTimeoutMillis: 5000,
});
pool.on("error", (err) =>
  console.error("Database connection error:", err.message),
);
export async function migrate() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS players (id BIGINT PRIMARY KEY, name TEXT NOT NULL, state JSONB NOT NULL, earned NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS leaderboard_idx ON players (earned DESC, id ASC);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, player_id BIGINT NOT NULL REFERENCES players(id), expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS operations (player_id BIGINT NOT NULL REFERENCES players(id), id UUID NOT NULL, payload JSONB NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(player_id,id));
CREATE INDEX IF NOT EXISTS operations_created ON operations(created_at);
`);
}
