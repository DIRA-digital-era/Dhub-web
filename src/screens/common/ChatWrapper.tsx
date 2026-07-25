// src/screens/common/ChatWrapper.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
} from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import ChatScreen from './ChatScreen';
import { fetchUserThreads, fetchThreadUnreadCount, subscribeToThreads } from '../../services/chatService';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StudentStackParamList } from '../../types';
import { useTheme } from '../../context/ThemeContext';

type ThreadItemProcessed = {
  threadId: string;
  displayName: string;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  participantId: string;
};

const STATIC_COLORS = {
  success: '#34C759',
} as const;

type ChatWrapperNavProp = NativeStackNavigationProp<StudentStackParamList>;

const ChatWrapper: React.FC = () => {
  const navigation = useNavigation<ChatWrapperNavProp>();
  const route = useRoute<RouteProp<{ Chat: { threadId?: string } }, 'Chat'>>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [threads, setThreads] = useState<ThreadItemProcessed[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const floatingButtonAnim = useRef(new Animated.Value(1)).current;

  const { colors: themeColors, isDark } = useTheme();
  const COLORS = React.useMemo(() => ({
    primary: themeColors.primary,
    primaryDark: themeColors.primary,
    primaryLight: isDark ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.1)',
    background: themeColors.background,
    textPrimary: themeColors.text,
    textSecondary: themeColors.textSecondary,
    textTertiary: isDark ? '#666666' : '#999999',
    bubbleOther: themeColors.card,
    border: themeColors.border,
    ...STATIC_COLORS,
  }), [themeColors, isDark]);
  const styles = React.useMemo(() => getStyles(COLORS, isDark), [COLORS, isDark]);

  useEffect(() => {
    if (route.params?.threadId) {
      setSelectedThreadId(route.params.threadId);
    }
  }, [route.params?.threadId]);

  const loadThreads = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const raw = await fetchUserThreads(currentUser.id, 50);
      const processed: ThreadItemProcessed[] = [];

      for (const t of raw) {
        const others = t.participants.filter(p => p.id !== currentUser.id);
        const displayName = others.length === 1 ? others[0].fullName : 'Unknown';

        processed.push({
          threadId: t.threadId,
          displayName,
          lastMessage: t.lastMessage,
          lastMessageTime: t.lastMessageTime,
          unreadCount: t.unreadCount, 
          participantId: others[0]?.id || '',
        });
      }

      setThreads(processed);
    } catch (err) {
      console.error('load threads failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThreads();
    
    // Animate floating button
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatingButtonAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(floatingButtonAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    
    animation.start();
    
    return () => {
      animation.stop();
    };
  }, [floatingButtonAnim, currentUser?.id]); 

  useEffect(() => {
    if (currentUser?.id) {
      // Subscribe to real-time changes
      const unsubscribe = subscribeToThreads(currentUser.id, () => {
        console.log('[ChatWrapper] Thread list refresh triggered via realtime');
        loadThreads();
      });
      
      return () => unsubscribe();
    }
  }, [currentUser?.id]);

  const handleThreadSelect = (threadId: string) => {
    setSelectedThreadId(threadId);
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return '';
    let dateStr = timestamp.replace(' ', 'T');
    if (!dateStr.includes('Z') && !dateStr.includes('+')) {
      dateStr += 'Z'; // Assume UTC from database
    }
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / 1000 / 60 / 60;
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleSupportPress = () => {
    navigation.navigate('Support', { currentUserId: currentUser?.id || '' });
  };

  if (!currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text>Loading user...</Text>
      </View>
    );
  }

  if (selectedThreadId) {
    return (
      <ChatScreen
        threadId={selectedThreadId}
        currentUserId={currentUser.id}
        onBack={() => setSelectedThreadId(null)}
      />
    );
  }

  const renderThreadItem = ({ item }: { item: ThreadItemProcessed }) => {
    const initials = item.displayName
      .split(' ')
      .map(s => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <TouchableOpacity
        style={styles.threadCard}
        onPress={() => handleThreadSelect(item.threadId)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark]}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </LinearGradient>

        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text style={styles.threadName} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text style={styles.threadTime}>
              {formatTime(item.lastMessageTime)}
            </Text>
          </View>
          
          <View style={styles.threadMessageContainer}>
            <Text style={[
              styles.threadMessage,
              item.unreadCount > 0 && styles.unreadThreadMessage
            ]} numberOfLines={1}>
              {item.lastMessage || 'No messages yet'}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={COLORS.background} />
      
      {/* Header */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chats</Text>
          <TouchableOpacity style={styles.newChatButton}>
            <Ionicons name="create-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="chat-outline"
            size={64}
            color={COLORS.textTertiary}
          />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>
            Start a new conversation to chat with others
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={item => item.threadId}
          contentContainerStyle={styles.listContainer}
          renderItem={renderThreadItem}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={false}
        />
      )}

      {/* Floating Support Button */}
      <Animated.View style={[
        styles.floatingButton,
        {
          transform: [{ scale: floatingButtonAnim }],
        }
      ]}>
        <TouchableOpacity
          onPress={handleSupportPress}
          style={styles.floatingButtonInner}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            style={styles.floatingButtonGradient}
          >
            <Ionicons name="headset" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const getStyles = (COLORS: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerSafeArea: { backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerTitle: { fontSize: 32, fontWeight: '700', color: COLORS.textPrimary },
  newChatButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: COLORS.textSecondary },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: COLORS.textSecondary, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: COLORS.textTertiary, marginTop: 8, textAlign: 'center' },
  listContainer: { paddingVertical: 8 },
  threadCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '600', fontSize: 20 },
  threadContent: { flex: 1, marginLeft: 16 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  threadName: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, flex: 1 },
  threadTime: { fontSize: 12, color: COLORS.textTertiary, marginLeft: 8 },
  threadMessageContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  threadMessage: { fontSize: 14, color: COLORS.textSecondary, flex: 1, marginRight: 8 },
  unreadThreadMessage: { color: COLORS.textPrimary, fontWeight: '500' },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  floatingButton: { position: 'absolute', bottom: 24, right: 20, zIndex: 100 },
  floatingButtonInner: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  floatingButtonGradient: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
});

export default ChatWrapper;