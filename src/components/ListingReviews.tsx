//src/components/ListingReviews.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { supabase } from '../utils/supabaseClient';
import { Ionicons } from '@expo/vector-icons';

type Review = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    id: string;
    full_name: string;
    profile_pic: string | null;
  };
};

type Props = {
  listingId: string;
};

const INITIAL_LIMIT = 3;

const ListingReviews: React.FC<Props> = ({ listingId }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const fetchReviews = async (currentLimit: number) => {
    setLoading(true);

    const { data, error } = await supabase
      .from('ratings')
      .select(`
        id,
        score,
        comment,
        created_at,
        reviewer:users (
          id,
          full_name,
          profile_pic
        )
      `)
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(currentLimit);

    if (!error && data) {
      setReviews(data.map((r: any) => ({
        ...r,
        reviewer: Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer,
      })) as Review[]);
      if (data.length < currentLimit) {
        setExhausted(true);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchReviews(limit);
  }, [limit, listingId]);

  const loadMore = () => {
    if (exhausted) return;

    if (limit === 3) setLimit(8);
    else setLimit(limit + 7);
  };

  const renderStars = (score: number) => {
    return (
      <View style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons
            key={i}
            name={i <= score ? 'star' : 'star-outline'}
            size={14}
            color="#B8860B"
          />
        ))}
      </View>
    );
  };

  const renderItem = ({ item }: { item: Review }) => (
    <View style={styles.reviewCard}>
      <View style={styles.header}>
        {item.reviewer.profile_pic ? (
          <Image source={{ uri: item.reviewer.profile_pic }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={16} color="#B8860B" />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.reviewer.full_name}</Text>
          {renderStars(item.score)}
        </View>

        <Text style={styles.date}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>

      {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
    </View>
  );

  if (!loading && reviews.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No ratings yet</Text>
        <Text style={styles.emptySub}>
          Book this listing and be the first to leave a review.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Reviews</Text>

      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
      />

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}

      {!loading && !exhausted && (
        <TouchableOpacity onPress={loadMore} style={styles.loadMoreBtn}>
          <Text style={styles.loadMoreText}>Load more</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default ListingReviews;

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: '#FAF9F6',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2F4F4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontWeight: '500',
    fontSize: 14,
  },
  date: {
    fontSize: 11,
    color: '#696969',
  },
  comment: {
    fontSize: 13,
    color: '#2F4F4F',
    marginTop: 4,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 10,
  },
  loadMoreText: {
    color: '#B8860B',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 13,
    color: '#696969',
    marginTop: 4,
    textAlign: 'center',
  },
});
