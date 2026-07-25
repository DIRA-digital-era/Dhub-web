// src/storage/favouritesManager.ts
import EventEmitter from 'eventemitter3';
import { supabase } from '../utils/supabaseClient';
import { Listing } from '../types';
import { getDB } from './favourites';

export type FavoriteRecord = {
  id?: number;
  listing_id: string;
  user_id: string;
  synced: 0 | 1;
};

interface ListingWithImages extends Listing {
  images: string[];
  image_url: string;
}

class FavoritesManagerClass {
  private emitter = new EventEmitter();

  // ---------------- EVENTS ----------------
  onFavoriteAdded(callback: (listing: ListingWithImages) => void) {
    this.emitter.on('favoriteAdded', callback);
  }
  onFavoriteRemoved(callback: (listingId: string) => void) {
    this.emitter.on('favoriteRemoved', callback);
  }
  offFavoriteAdded(callback: (listing: ListingWithImages) => void) {
    this.emitter.off('favoriteAdded', callback);
  }
  offFavoriteRemoved(callback: (listingId: string) => void) {
    this.emitter.off('favoriteRemoved', callback);
  }

  private emitAdded(listing: ListingWithImages) {
    this.emitter.emit('favoriteAdded', listing);
  }
  private emitRemoved(listingId: string) {
    this.emitter.emit('favoriteRemoved', listingId);
  }

  // ---------------- CRUD ----------------
  async addFavorite(
    listingId: string,
    userId: string,
    listing?: ListingWithImages,
    synced: 0 | 1 = 0
  ) {
    try {
      const db = await getDB();
      await db.runAsync(
        `INSERT OR IGNORE INTO favorites (listing_id, user_id, synced) VALUES (?, ?, ?);`,
        listingId,
        userId,
        synced
      );

      if (listing) this.emitAdded(listing);

      if (!synced) {
        try {
          await supabase.from('favorites').insert({
            user_id: userId,
            listing_id: listingId,
            created_at: new Date().toISOString(),
          });
          await this.markSynced(listingId, userId);
        } catch (err) {
          console.warn('Online sync failed for addFavorite:', listingId, err);
        }
      }
    } catch (err) {
      console.error('addFavorite error:', err);
    }
  }

  async removeFavorite(listingId: string, userId: string) {
    try {
      const db = await getDB();
      await db.runAsync(
        `DELETE FROM favorites WHERE listing_id=? AND user_id=?;`,
        listingId,
        userId
      );

      this.emitRemoved(listingId);

      try {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('listing_id', listingId);
      } catch (err) {
        console.warn('Online remove failed for removeFavorite:', listingId, err);
      }
    } catch (err) {
      console.error('removeFavorite error:', err);
    }
  }

  async isFavorite(listingId: string, userId: string): Promise<boolean> {
    try {
      const db = await getDB();
      const row = await db.getFirstAsync<{ listing_id: string }>(
        `SELECT listing_id FROM favorites WHERE listing_id=? AND user_id=? LIMIT 1;`,
        listingId,
        userId
      );
      return row !== null;
    } catch (err) {
      console.error('isFavorite error:', err);
      return false;
    }
  }

  async getFavorites(userId: string): Promise<FavoriteRecord[]> {
    try {
      const db = await getDB();
      return await db.getAllAsync<FavoriteRecord>(
        `SELECT * FROM favorites WHERE user_id=?;`,
        userId
      );
    } catch (err) {
      console.error('getFavorites error:', err);
      return [];
    }
  }

  async getUnsynced(userId: string): Promise<FavoriteRecord[]> {
    try {
      const db = await getDB();
      return await db.getAllAsync<FavoriteRecord>(
        `SELECT * FROM favorites WHERE user_id=? AND synced=0;`,
        userId
      );
    } catch (err) {
      console.error('getUnsynced error:', err);
      return [];
    }
  }

  async markSynced(listingId: string, userId: string) {
    try {
      const db = await getDB();
      await db.runAsync(
        `UPDATE favorites SET synced=1 WHERE listing_id=? AND user_id=?;`,
        listingId,
        userId
      );
    } catch (err) {
      console.error('markSynced error:', err);
    }
  }

  async syncWithSupabase(userId: string) {
    try {
      const unsynced = await this.getUnsynced(userId);
      for (const fav of unsynced) {
        try {
          await supabase.from('favorites').insert({
            user_id: fav.user_id,
            listing_id: fav.listing_id,
            created_at: new Date().toISOString(),
          });
          await this.markSynced(fav.listing_id, fav.user_id);
        } catch (err) {
          console.warn('Failed to sync favorite:', fav.listing_id, err);
        }
      }
    } catch (err) {
      console.error('syncWithSupabase error:', err);
    }
  }

  // ---------------- FETCH LISTINGS ----------------
  async fetchListings(listingIds: string[]): Promise<{ data: ListingWithImages[]; error: any }> {
    if (!listingIds.length) return { data: [], error: null };

    try {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .in('id', listingIds);

      if (error) return { data: [], error };

      const listingsWithImages: ListingWithImages[] = (data ?? []).map((l: any) => {
        const imageArray = Array.isArray(l.media)
          ? l.media
              .filter((m: any) => m.type === 'image')
              .map((m: any) => m.thumbUrl || m.url)
          : [];

        return {
          ...l,
          images: imageArray.length > 0 ? imageArray : ['https://via.placeholder.com/400x240.png?text=No+Image'],
          image_url: imageArray[0] || 'https://via.placeholder.com/400x240.png?text=No+Image',
        };
      });

      return { data: listingsWithImages, error: null };
    } catch (err) {
      console.error('fetchListings error:', err);
      return { data: [], error: err };
    }
  }
}

// ---------------- SINGLETON ----------------
const FavoritesManager = new FavoritesManagerClass();
export default FavoritesManager;