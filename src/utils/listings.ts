// src/utils/listings.ts
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { supabase } from '../utils/supabaseClient';

import {
  Landlord,
  ListingDetails,
  ListingFilters,
  ListingSummary,
  MediaItem,
  Review
} from '../types';

/* ======================================================
   USER LOCATION HELPER
   ====================================================== */

export type UserLocation = {
  lat: number;
  lng: number;
};

// other helper types, exported so they do not conflict in HomeScreen
export type { ListingFilters, ListingSummary };

/**
 * getUserLocation
 * - Requests foreground permission
 * - Redirects to settings if denied
 * - Returns null safely
 */
export async function getUserLocation(): Promise<UserLocation | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    let finalStatus = status;

    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      finalStatus = req.status;
    }

    if (finalStatus !== 'granted') {
      if (Platform.OS === 'ios') {
        Linking.openURL('app-settings:');
      } else {
        Linking.openSettings();
      }
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (err) {
    console.warn('getUserLocation failed:', err);
    return null;
  }
}

/* ======================================================
   FETCH LISTINGS (SERVER-SIDE FILTERING)
   ====================================================== */

export async function fetchListings(
  filters: ListingFilters
): Promise<ListingSummary[]> {
  try {
    const {
      search,
      city,
      rooms,
      minPrice,
      maxPrice,
      availableOnly = true,
      boostedFirst = true,
      limit = 20,
      offset = 0,
      listing_type,
      stay_type,
      lat,
      lng,
      radius_m,
    } = filters;

    const isGeoSearch =
      lat != null && lng != null && radius_m != null;

    let query;

    if (isGeoSearch) {
      // ===== REAL GEO SEARCH (RPC) =====
      query = supabase
        .rpc('listings_within_radius', {
          lat,
          lng,
          radius_m,
        })
        .select(`
          id,
          title,
          price,
          city,
          rooms,
          media,
          avg_rating,
          rating_count,
          landlord_id,
          available,
          boost_until,
          created_at,
          listing_type,
          stay_type,
          price_unit,
          processing_status
        `);
    } else {
      // ===== NORMAL TABLE QUERY =====
      query = supabase
        .from('listings')
        .select(`
          id,
          title,
          price,
          city,
          rooms,
          media,
          avg_rating,
          rating_count,
          landlord_id,
          available,
          boost_until,
          created_at,
          listing_type,
          stay_type,
          price_unit,
          processing_status
        `);
    }

    // --------------------------------------------------
    // COMMON FILTERS (APPLY TO BOTH PATHS)
    // --------------------------------------------------

    if (search) {
      const ilike = `%${search.trim()}%`;
      query = query.or(`title.ilike.${ilike},city.ilike.${ilike}`);
    }

    if (city) query = query.eq('city', city);
    if (availableOnly) query = query.eq('available', true);

    if (typeof rooms === 'number') query = query.eq('rooms', rooms);
    if (rooms === '5+') query = query.gte('rooms', 5);

    if (minPrice != null) query = query.gte('price', minPrice);
    if (maxPrice != null) query = query.lte('price', maxPrice);

    if (listing_type) query = query.eq('listing_type', listing_type);
    if (stay_type) query = query.eq('stay_type', stay_type);

    if (boostedFirst) {
      query = query.order('boost_until', { ascending: false });
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    // console.log('[fetchListings] Data loaded:', data?.length ?? 0);
    if (error || !Array.isArray(data)) return [];

    return data.map(row => {
      const imagesArray = Array.isArray(row.media)
        ? row.media
            .filter((m: any) => m.type === 'image') // only images
            .map((m: any) => {
              const base = m.thumbUrl || m.url;
              if (base && base.startsWith('/media/')) {
                const MEDIA_BASE_URL = 'https://listings.frunjimbong.workers.dev';
                return `${MEDIA_BASE_URL}${base}`;
              }
              return base;
            })
        : [];

      return {
        id: String(row.id),
        title: row.title ?? '',
        price: Number(row.price ?? 0),
        city: row.city ?? '',
        rooms: row.rooms ?? null,
        landlord_id: row.landlord_id ?? '',
        image_url: imagesArray[0] || 'https://via.placeholder.com/400x250?text=No+Image',
        images: imagesArray.length ? imagesArray : ['https://via.placeholder.com/400x250?text=No+Image'],
        avg_rating: row.avg_rating ?? null,
        rating_count: row.rating_count ?? null,
        available: row.available ?? null,
        boosted: Boolean(row.boost_until),
        created_at: row.created_at,
        listing_type: row.listing_type,
        stay_type: row.stay_type,
        price_unit: row.price_unit,
        processing_status: (row as any).processing_status ?? 'ready',
      };
    });
  } catch (err) {
    console.error('fetchListings error:', err);
    return [];
  }
}

/* ======================================================
   FETCH LISTING DETAILS
   ====================================================== */

export async function fetchListingDetails(
  id: string
): Promise<ListingDetails | null> {
  try {
    const select = `
      id,
      title,
      description,
      price,
      city,
      latitude,
      longitude,
      media,
      rooms,
      available,
      boost_until,
      avg_rating,
      rating_count,
      created_at,
      updated_at,
      landlord_id,
      processing_status,
      landlord:users!listings_landlord_id_fkey(
        id,
        full_name,
        email,
        phone,
        profile_pic,
        created_at
      )
    `;

    const { data: row, error } = await supabase
      .from('listings')
      .select(select)
      .eq('id', id)
      .single();

    if (error || !row) return null;

    // ─────────────────────────────────────────────────────────────────────────
    // LANDLORD PARSING — CRITICAL FIX
    //
    // Supabase PostgREST returns a *to-one* foreign key join as a plain
    // object, NOT an array:
    //
    //   row.landlord = { id: '...', full_name: '...', phone: '...', ... }
    //
    // The previous code did:
    //   const landlordArray = (row.landlord ?? []) as any[];
    //   if (landlordArray.length > 0)  ← length of an object is undefined → falsy
    //
    // So landlord was ALWAYS set to `undefined`, which made listing.landlord
    // null in the UI, hiding the Call button (no phone) and breaking handleChat.
    //
    // Fix: normalise both shapes (object OR array) into a single object.
    // ─────────────────────────────────────────────────────────────────────────
    const landlordRaw = row.landlord as any;
    let landlord: Landlord | undefined;

    if (landlordRaw) {
      // to-one join → plain object; to-many (edge case) → array
      const obj: any = Array.isArray(landlordRaw) ? landlordRaw[0] : landlordRaw;

      if (obj?.id) {
        landlord = {
          id: obj.id,
          full_name: obj.full_name ?? '',
          email: obj.email ?? null,
          phone: obj.phone ?? null,
          profile_pic: obj.profile_pic ?? null,
          created_at: obj.created_at,
        };
      }
    }

    // If the join silently failed (RLS, missing select, etc.) fall back to a
    // separate direct query so the screen always has at minimum the landlord id.
    if (!landlord && row.landlord_id) {
      const { data: fallbackUser } = await supabase
        .from('users')
        .select('id, full_name, email, phone, profile_pic, created_at')
        .eq('id', row.landlord_id)
        .single();

      if (fallbackUser) {
        landlord = {
          id: fallbackUser.id,
          full_name: fallbackUser.full_name ?? '',
          email: fallbackUser.email ?? null,
          phone: fallbackUser.phone ?? null,
          profile_pic: fallbackUser.profile_pic ?? null,
          created_at: fallbackUser.created_at,
        };
      }
    }

    // Convert media — filter items that have both url and type
    const media: MediaItem[] = Array.isArray(row.media)
      ? row.media
          .filter((m: any) => m?.url && m?.type)
          .map((m: any) => {
            const MEDIA_BASE_URL = 'https://listings.frunjimbong.workers.dev';
            return {
              ...m,
              url: m.url.startsWith('/media/') ? `${MEDIA_BASE_URL}${m.url}` : m.url,
              thumbUrl: m.thumbUrl && m.thumbUrl.startsWith('/media/') 
                ? `${MEDIA_BASE_URL}${m.thumbUrl}` 
                : m.thumbUrl,
            };
          })
      : [];
    // console.log('[fetchListingDetails] media data loaded');
    // Fetch ratings
    const { data: ratingsData } = await supabase
      .from('ratings')
      .select(`
        id,
        score,
        comment,
        created_at,
        reviewer:users(id, full_name, profile_pic)
      `)
      .eq('listing_id', id)
      .order('created_at', { ascending: false });

    const ratings: Review[] = Array.isArray(ratingsData)
      ? ratingsData.map((r: any) => {
          // reviewer join is also a to-one → object, not array
          const reviewerRaw = r.reviewer;
          const reviewer = Array.isArray(reviewerRaw) ? reviewerRaw[0] : reviewerRaw;
          return {
            id: r.id,
            score: r.score,
            comment: r.comment ?? null,
            created_at: r.created_at,
            reviewer: {
              id: reviewer?.id ?? '',
              full_name: reviewer?.full_name ?? 'Unknown',
              profile_pic: reviewer?.profile_pic ?? null,
            },
          };
        })
      : [];

    // Return TS-safe ListingDetails
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      price: Number(row.price ?? 0),
      city: row.city,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      media,
      rooms: row.rooms ?? null,
      avg_rating: row.avg_rating ?? null,
      rating_count: row.rating_count ?? null,
      available: row.available ?? null,
      boost_until: row.boost_until ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at ?? undefined,
      landlord_id: row.landlord_id,
      landlord,       // ✅ now correctly populated
      ratings,
      processing_status: (row as any).processing_status ?? 'ready',
    };

  } catch (err) {
    console.error('fetchListingDetails error:', err);
    return null;
  }
}