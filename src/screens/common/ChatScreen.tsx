// src/screens/common/ChatScreen.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  Platform,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { debugAuthJwt } from '../../services/chatService';
import { ChatMessage, ChatMessageDto } from '../../types';
import {
  sendMessage,
  subscribeToThread,
  fetchThreadMessages,
  markMessagesRead,
  getThreadParticipantInfo,
} from '../../services/chatService';
import { StudentStackParamList } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatScreenProps {
  currentUserId: string;
  threadId: string;
  onBack?: () => void;
}

type ChatNavProp = NativeStackNavigationProp<StudentStackParamList, 'StudentTabs'>;

// ─── Design tokens ────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#D4AF37',
  primaryDark: '#B8960C',
  primaryLight: '#F5E7C8',
  background: '#FFFFFF',
  surface: '#F8F9FA',
  bubbleMeStart: '#E6C05B',
  bubbleMeEnd: '#D4AF37',
  bubbleOther: '#F2F2F7',
  textPrimary: '#1A1A1A',
  textSecondary: '#555555',
  textTertiary: '#999999',
  border: '#EBEBEB',
  dateBadge: '#ECF0F1',
  dateBadgeText: '#7F8C8D',
  inputBorder: '#E0E0E0',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mapDtoToChatMessage = (dto: ChatMessageDto): ChatMessage => ({
  id: dto.id,
  threadId: dto.thread_id,
  senderId: dto.sender_id,
  receiverId: dto.receiver_id ?? null,
  message: dto.body,
  read: dto.is_read,
  created_at: dto.created_at,
});

const parseDate = (ts: string): Date => {
  let s = ts.replace(' ', 'T');
  if (!s.includes('Z') && !s.includes('+')) s += 'Z';
  return new Date(s);
};

const formatTime = (ts: string) => {
  const d = parseDate(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatDayLabel = (d: Date): string => {
  const now = new Date();
  if (isSameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

// ─── Component ────────────────────────────────────────────────────────────────
const ChatScreen: React.FC<ChatScreenProps> = ({ currentUserId, threadId, onBack }) => {
  const navigation = useNavigation<ChatNavProp>();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [participantName, setParticipantName] = useState('');

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
  const lastScrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // ── Load participant ─────────────────────────────────────────────────────────
  useEffect(() => {
    getThreadParticipantInfo(threadId, currentUserId)
      .then(info => setParticipantName(info.fullName))
      .catch(() => setParticipantName('Unknown User'));
  }, [threadId, currentUserId]);

  useEffect(() => { debugAuthJwt(); }, []);

  // ── Load messages + subscribe ────────────────────────────────────────────────
  useEffect(() => {
    if (!threadId || !currentUserId) return;
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        setLoading(true);
        const dtos = await fetchThreadMessages(threadId, 100);
        if (mounted) setMessages(dtos.map(mapDtoToChatMessage));
        await markMessagesRead(threadId, currentUserId);

        unsubscribe = subscribeToThread(
          threadId,
          (newDto) => {
            const msg = mapDtoToChatMessage(newDto);
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
              return [...prev, msg];
            });
            if (msg.senderId !== currentUserId) {
              markMessagesRead(threadId, currentUserId);
            }
          },
          (updatedDto) => {
            setMessages(prev =>
              prev.map(m => m.id === updatedDto.id ? { ...m, read: updatedDto.is_read } : m)
            );
          }
        );
      } catch (err) {
        console.error('Chat init error', err);
      } finally {
        if (mounted) setLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 300);
      }
    };

    init();
    return () => {
      mounted = false;
      unsubscribe?.();
      if (lastScrollTimeout.current) clearTimeout(lastScrollTimeout.current);
    };
  }, [threadId, currentUserId]);

  // ── Send ─────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    // Animate send button
    Animated.sequence([
      Animated.timing(sendScale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(sendScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      threadId,
      senderId: currentUserId,
      receiverId: null,
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const dto = await sendMessage(currentUserId, threadId, text);
      const serverMsg = mapDtoToChatMessage(dto);
      setMessages(prev => {
        if (prev.some(m => m.id === serverMsg.id)) return prev.filter(m => m.id !== tempId);
        return prev.map(m => m.id === tempId ? serverMsg : m);
      });
    } catch {
      setInput(text);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isMe = item.senderId === currentUserId;
      const prev = index > 0 ? messages[index - 1] : null;
      const next = index < messages.length - 1 ? messages[index + 1] : null;

      const showAvatar = !isMe && (!next || next.senderId !== item.senderId);
      const showTime = !next || next.senderId !== item.senderId;

      // Date separator
      const thisDate = parseDate(item.created_at);
      const prevDate = prev ? parseDate(prev.created_at) : null;
      const showDateSep = !prevDate || !isSameDay(prevDate, thisDate);

      const isTemp = item.id.startsWith('temp-');

      return (
        <>
          {showDateSep && (
            <View style={styles.dateSeparator}>
              <View style={styles.dateLine} />
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{formatDayLabel(thisDate)}</Text>
              </View>
              <View style={styles.dateLine} />
            </View>
          )}

          <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
            {/* Other user avatar placeholder */}
            {!isMe && (
              <View style={styles.avatarSpace}>
                {showAvatar && (
                  <LinearGradient
                    colors={[COLORS.bubbleMeStart, COLORS.bubbleMeEnd]}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>
                      {participantName?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </LinearGradient>
                )}
              </View>
            )}

            <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
              {isMe ? (
                <LinearGradient
                  colors={[COLORS.bubbleMeStart, COLORS.bubbleMeEnd]}
                  style={[styles.bubble, styles.bubbleMe]}
                >
                  <Text style={styles.bubbleTextMe}>{item.message}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.bubble, styles.bubbleOther]}>
                  <Text style={styles.bubbleTextOther}>{item.message}</Text>
                </View>
              )}

              {showTime && (
                <View style={[styles.timeRow, isMe ? styles.timeRowMe : styles.timeRowOther]}>
                  <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
                  {isMe && (
                    isTemp
                      ? <Ionicons name="time-outline" size={11} color={COLORS.textTertiary} style={styles.tickIcon} />
                      : item.read
                        ? <Ionicons name="checkmark-done" size={13} color={COLORS.primary} style={styles.tickIcon} />
                        : <Ionicons name="checkmark" size={13} color={COLORS.textTertiary} style={styles.tickIcon} />
                  )}
                </View>
              )}
            </View>
          </View>
        </>
      );
    },
    [messages, currentUserId, participantName]
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => { Keyboard.dismiss(); onBack ? onBack() : navigation.goBack(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        {/* Avatar + name */}
        <LinearGradient
          colors={[COLORS.bubbleMeStart, COLORS.bubbleMeEnd]}
          style={styles.headerAvatar}
        >
          <Text style={styles.headerAvatarText}>
            {participantName?.charAt(0).toUpperCase() || '?'}
          </Text>
        </LinearGradient>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>
            {participantName || '...'}
          </Text>
          <View style={styles.headerOnlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.headerOnlineText}>Online</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Messages ── */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={52} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptySubtitle}>
              Say hello! Your messages are private between you and {participantName || 'the other user'}.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            onContentSizeChange={() => {
              if (lastScrollTimeout.current) clearTimeout(lastScrollTimeout.current);
              lastScrollTimeout.current = setTimeout(
                () => flatListRef.current?.scrollToEnd({ animated: true }),
                100
              );
            }}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={10}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        )}

        {/* ── Input bar ── */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.inputInner}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Type a message..."
              placeholderTextColor={COLORS.textTertiary}
              multiline
              maxLength={500}
              editable={!sending}
              textAlignVertical="center"
              returnKeyType="default"
              blurOnSubmit={false}
            />

            <Animated.View style={{ transform: [{ scale: sendScale }] }}>
              <TouchableOpacity
                style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || sending}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="send"
                    size={18}
                    color={input.trim() ? '#fff' : COLORS.textTertiary}
                  />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: { marginTop: 12, fontSize: 15, color: COLORS.textSecondary },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  headerOnlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759' },
  headerOnlineText: { fontSize: 12, color: '#34C759', fontWeight: '500' },

  // Message list
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 2,
    alignItems: 'flex-end',
  },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  avatarSpace: { width: 34, marginRight: 6, alignItems: 'center', justifyContent: 'flex-end' },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  bubbleWrap: { maxWidth: '78%' },
  bubbleWrapMe: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },

  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: COLORS.bubbleOther,
    borderBottomLeftRadius: 4,
  },
  bubbleTextMe: { fontSize: 15, lineHeight: 22, color: '#fff' },
  bubbleTextOther: { fontSize: 15, lineHeight: 22, color: COLORS.textPrimary },

  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginBottom: 4, gap: 2 },
  timeRowMe: { justifyContent: 'flex-end', paddingRight: 2 },
  timeRowOther: { justifyContent: 'flex-start', paddingLeft: 2 },
  timeText: { fontSize: 11, color: COLORS.textTertiary },
  tickIcon: { marginLeft: 1 },

  // Date separator
  dateSeparator: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 16, paddingHorizontal: 4, gap: 8,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  dateBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: COLORS.dateBadge, borderRadius: 10,
  },
  dateBadgeText: { fontSize: 12, color: COLORS.dateBadgeText, fontWeight: '500' },

  // Empty state
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40, paddingVertical: 60,
  },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20, fontWeight: '700', color: COLORS.textPrimary,
    marginBottom: 8, textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20,
  },

  // Input bar
  inputContainer: {
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: COLORS.inputBorder,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    maxHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 6 : 4,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-end',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
});

export default ChatScreen;