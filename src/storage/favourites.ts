// src/storage/favourites.ts
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('favorites.db');
    const nativeDb = await dbPromise;
    await ensureTables(nativeDb);
  }
  const nativeDb = await dbPromise;
  return createWrapper(nativeDb);
}

function createWrapper(database: SQLiteDatabase) {
  return {
    execAsync: (sql: string): Promise<void> => {
      // execAsync only takes SQL string
      return database.execAsync(sql);
    },
    runAsync: (sql: string, ...bindParams: any[]): Promise<{ changes: number; lastInsertRowId: number }> => {
      // Use runAsync for parameterized queries
      return database.runAsync(sql, ...bindParams);
    },
    getFirstAsync: <T = any>(sql: string, ...bindParams: any[]): Promise<T | null> => {
      return database.getFirstAsync(sql, ...bindParams) as Promise<T | null>;
    },
    getAllAsync: <T = any>(sql: string, ...bindParams: any[]): Promise<T[]> => {
      return database.getAllAsync(sql, ...bindParams) as Promise<T[]>;
    },
  };
}

async function ensureTables(db: SQLiteDatabase): Promise<void> {
  const w = createWrapper(db);

  await w.execAsync(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value INTEGER
    );
  `);

  const rows = await w.getAllAsync<{ value: number }>(
    `SELECT value FROM meta WHERE key = ?;`,
    'db_version'
  );
  const currentVersion = rows.length ? rows[0].value : 0;

  const DB_VERSION = 1;
  if (currentVersion < DB_VERSION) {
    await w.execAsync(`
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        UNIQUE(listing_id, user_id)
      );
    `);

    await w.runAsync(
      `INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);`,
      'db_version',
      DB_VERSION
    );
  }
}
