// src/storage/favourites.ts
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Since this is a web app, we mock the SQLite interface and use AsyncStorage
// to persist the favorites cache locally without crashing.

interface FavoriteRecord {
  id?: number;
  listing_id: string;
  user_id: string;
  synced: 0 | 1;
}

class WebDatabaseMock {
  private cache: FavoriteRecord[] = [];
  private loaded = false;

  async init() {
    if (this.loaded) return;
    try {
      const data = await AsyncStorage.getItem('dhub_favorites_cache');
      if (data) {
        this.cache = JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed to load favorites cache', e);
    }
    this.loaded = true;
  }

  async save() {
    try {
      await AsyncStorage.setItem('dhub_favorites_cache', JSON.stringify(this.cache));
    } catch (e) {
      console.warn('Failed to save favorites cache', e);
    }
  }

  async execAsync(sql: string): Promise<void> {
    // No-op for web
  }

  async runAsync(sql: string, ...bindParams: any[]): Promise<{ changes: number; lastInsertRowId: number }> {
    await this.init();
    if (sql.includes('INSERT OR IGNORE INTO favorites')) {
      const [listingId, userId, synced] = bindParams;
      const exists = this.cache.find(f => f.listing_id === listingId && f.user_id === userId);
      if (!exists) {
        this.cache.push({ listing_id: listingId, user_id: userId, synced });
        await this.save();
        return { changes: 1, lastInsertRowId: Date.now() };
      }
    } else if (sql.includes('DELETE FROM favorites')) {
      const [listingId, userId] = bindParams;
      const initLen = this.cache.length;
      this.cache = this.cache.filter(f => !(f.listing_id === listingId && f.user_id === userId));
      if (this.cache.length !== initLen) await this.save();
      return { changes: initLen - this.cache.length, lastInsertRowId: 0 };
    } else if (sql.includes('UPDATE favorites SET synced=1')) {
      const [listingId, userId] = bindParams;
      let changes = 0;
      this.cache = this.cache.map(f => {
        if (f.listing_id === listingId && f.user_id === userId) {
          changes++;
          return { ...f, synced: 1 };
        }
        return f;
      });
      if (changes > 0) await this.save();
      return { changes, lastInsertRowId: 0 };
    }
    return { changes: 0, lastInsertRowId: 0 };
  }

  async getFirstAsync<T = any>(sql: string, ...bindParams: any[]): Promise<T | null> {
    await this.init();
    if (sql.includes('SELECT listing_id FROM favorites')) {
      const [listingId, userId] = bindParams;
      const found = this.cache.find(f => f.listing_id === listingId && f.user_id === userId);
      return (found ? { listing_id: found.listing_id } : null) as any;
    }
    return null;
  }

  async getAllAsync<T = any>(sql: string, ...bindParams: any[]): Promise<T[]> {
    await this.init();
    if (sql.includes('SELECT * FROM favorites WHERE user_id=? AND synced=0')) {
      const [userId] = bindParams;
      return this.cache.filter(f => f.user_id === userId && f.synced === 0) as any;
    } else if (sql.includes('SELECT * FROM favorites WHERE user_id=?')) {
      const [userId] = bindParams;
      return this.cache.filter(f => f.user_id === userId) as any;
    }
    return [];
  }
}

let dbInstance: WebDatabaseMock | null = null;

export async function getDB() {
  if (!dbInstance) {
    dbInstance = new WebDatabaseMock();
    await dbInstance.init();
  }
  return dbInstance;
}
