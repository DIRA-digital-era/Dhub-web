// src/screens/common/SupportScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Animated,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StudentStackParamList, Ticket, Chat, FAQ } from '../../types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import {
  fetchLatestTicket,
  createTicket,
  fetchChats,
  fetchFaqs,
  sendChatMessageWithBot,
} from '../../services/supportService';

type SupportProps = NativeStackScreenProps<StudentStackParamList, 'Support'>;

// ─── tokens ───────────────────────────────────────────────────────────────────
const GOLD   = '#D4AF37';
const GOLD_D = '#B8960C';
const GOLD_L = '#F5E7C8';
const WHITE  = '#FFFFFF';
const BG     = '#F8F9FA';
const GREY1  = '#1A1A1A';
const GREY2  = '#555555';
const GREY3  = '#999999';
const BORDER = '#EBEBEB';
const GREEN  = '#34C759';

// ─── helpers ──────────────────────────────────────────────────────────────────
const parseTs = (ts: string): Date => {
  let s = ts.replace(' ', 'T');
  if (!s.includes('Z') && !s.includes('+')) s += 'Z';
  return new Date(s);
};

const fmtTime = (ts: string) =>
  parseTs(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth()    === b.getMonth()    &&
  a.getDate()     === b.getDate();

const dayLabel = (d: Date): string => {
  const now  = new Date();
  if (sameDay(d, now)) return 'Today';
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

// ─── component ────────────────────────────────────────────────────────────────
const SupportScreen: React.FC<SupportProps> = ({ route }) => {
  const { currentUserId } = route.params;

  const [ticket,     setTicket]     = useState<Ticket | null>(null);
  const [chats,      setChats]      = useState<Chat[]>([]);
  const [faqs,       setFaqs]       = useState<FAQ[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending,    setSending]    = useState(false);
  const [botOptions, setBotOptions] = useState<string[]>([]);

  const flatListRef = useRef<FlatList<Chat>>(null);
  const sendScale   = useRef(new Animated.Value(1)).current;

  // ── init ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        let t = await fetchLatestTicket(currentUserId);
        if (!t) t = await createTicket(currentUserId);
        setTicket(t);
        const [chatData, faqData] = await Promise.all([
          fetchChats(t.id),
          fetchFaqs(10),
        ]);
        setChats(chatData);
        setFaqs(faqData);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
      } catch (err) {
        console.error('Support init failed:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [currentUserId]);

  // ── send ──────────────────────────────────────────────────────────────────────
  const handleSend = async (messageText?: string) => {
    const msg = (messageText ?? newMessage).trim();
    if (!msg || !ticket) return;

    Animated.sequence([
      Animated.timing(sendScale, { toValue: 0.85, duration: 80,  useNativeDriver: true }),
      Animated.timing(sendScale, { toValue: 1,    duration: 100, useNativeDriver: true }),
    ]).start();

    try {
      setSending(true);
      setNewMessage('');
      Keyboard.dismiss();

      const { userMessage, botReply, options } = await sendChatMessageWithBot({
        ticket_id: ticket.id,
        sender_id: currentUserId,
        message:   msg,
      });

      setChats(prev => [...prev, userMessage]);
      if (botReply) setChats(prev => [...prev, botReply]);
      setBotOptions(options || []);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  // ── render bubble ─────────────────────────────────────────────────────────────
  const renderChat = useCallback(
    ({ item, index }: { item: Chat; index: number }) => {
      const isMe    = item.sender_id === currentUserId;
      const prev    = index > 0 ? chats[index - 1] : null;
      const next    = index < chats.length - 1 ? chats[index + 1] : null;

      const thisDate    = parseTs(item.created_at);
      const prevDate    = prev ? parseTs(prev.created_at) : null;
      const showDateSep = !prevDate || !sameDay(prevDate, thisDate);
      const showTime    = !next || next.sender_id !== item.sender_id;
      const showAvatar  = !isMe && (!next || next.sender_id !== item.sender_id);

      return (
        <>
          {showDateSep && (
            <View style={styles.dateSep}>
              <View style={styles.dateLine} />
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{dayLabel(thisDate)}</Text>
              </View>
              <View style={styles.dateLine} />
            </View>
          )}

          <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
            {!isMe && (
              <View style={styles.avatarSpace}>
                {showAvatar && (
                  <View style={styles.botAvatar}>
                    <Ionicons name="headset" size={13} color={WHITE} />
                  </View>
                )}
              </View>
            )}

            <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
              {isMe ? (
                <LinearGradient
                  colors={[GOLD, GOLD_D] as const}
                  style={[styles.bubble, styles.bubbleMe]}
                >
                  <Text style={styles.bubbleTextMe}>{item.message}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.bubble, styles.bubbleBot]}>
                  <Text style={styles.bubbleTextBot}>{item.message}</Text>
                </View>
              )}
              {showTime && (
                <Text style={[styles.timeText, isMe ? styles.timeMe : styles.timeBot]}>
                  {fmtTime(item.created_at)}
                </Text>
              )}
            </View>
          </View>
        </>
      );
    },
    [chats, currentUserId]
  );

  // ── loading ───────────────────────────────────────────────────────────────────
  if (loading || !ticket) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.loadWrap} edges={['top', 'bottom']}>
          <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
          <View style={styles.loadInner}>
            <View style={styles.loadIcon}>
              <Ionicons name="headset" size={36} color={GOLD} />
            </View>
            <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 16 }} />
            <Text style={styles.loadText}>Connecting to support...</Text>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  // ── main render ───────────────────────────────────────────────────────────────
  //
  // KEY STRUCTURE (cross-platform keyboard fix):
  //   KeyboardAvoidingView  <-- outermost, handles iOS padding / Android height
  //     SafeAreaView edges=['top','bottom']
  //       Header (static)
  //       Contact banner (static)
  //       FAQ chips (static)
  //       FlatList (flex:1, grows/shrinks)
  //       Bot option pills
  //       Input bar (SafeAreaView bottom inset already included)
  //
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: WHITE }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

        {/* ── Header ── */}
        <View style={styles.header}>
          <LinearGradient colors={[GOLD, GOLD_D] as const} style={styles.headerAvatar}>
            <Ionicons name="headset" size={22} color={WHITE} />
          </LinearGradient>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>DHUB Support</Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineLabel}>We're online</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => Linking.openURL('tel:+237682366472')}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={16} color={WHITE} />
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>
        </View>

        {/* ── Contact banner ── */}
        <View style={styles.contactBanner}>
          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => Linking.openURL('tel:+237682366472')}
            activeOpacity={0.75}
          >
            <View style={styles.contactIcon}>
              <Ionicons name="call-outline" size={14} color={GOLD_D} />
            </View>
            <Text style={styles.contactText}>+237 682 366 472</Text>
          </TouchableOpacity>

          <View style={styles.contactDivider} />

          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => Linking.openURL('mailto:dhubcmr@gmail.com')}
            activeOpacity={0.75}
          >
            <View style={styles.contactIcon}>
              <Ionicons name="mail-outline" size={14} color={GOLD_D} />
            </View>
            <Text style={styles.contactText}>dhubcmr@gmail.com</Text>
          </TouchableOpacity>
        </View>

        {/* ── FAQ chips ── */}
        {faqs.length > 0 && (
          <View style={styles.faqSection}>
            <Text style={styles.faqLabel}>Quick topics</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.faqScroll}
            >
              {faqs.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.faqChip}
                  onPress={() => handleSend(item.answer || item.question)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="help-circle-outline" size={13} color={GOLD_D} />
                  <Text style={styles.faqChipText} numberOfLines={1}>{item.question}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Chat list ── */}
        {chats.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={48} color={GOLD} />
            </View>
            <Text style={styles.emptyTitle}>How can we help?</Text>
            <Text style={styles.emptySub}>
              Send a message or tap a quick topic above to get started.
            </Text>
          </View>
        ) : (
          <FlatList<Chat>
            ref={flatListRef}
            data={chats}
            keyExtractor={item => item.id}
            renderItem={renderChat}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        {/* ── Bot option pills ── */}
        {botOptions.length > 0 && (
          <View style={styles.botOptWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.botOptScroll}
            >
              {botOptions.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={styles.botOptPill}
                  onPress={() => handleSend(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.botOptText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Input bar ── */}
        <View style={styles.inputContainer}>
          <View style={styles.inputInner}>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Ask anything..."
              placeholderTextColor={GREY3}
              multiline
              maxLength={500}
              editable={!sending}
              textAlignVertical="center"
              returnKeyType="default"
              blurOnSubmit={false}
              scrollEnabled
            />
            <Animated.View style={{ transform: [{ scale: sendScale }] }}>
              <TouchableOpacity
                style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnOff]}
                onPress={() => handleSend()}
                disabled={!newMessage.trim() || sending}
                activeOpacity={0.8}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={18} color={newMessage.trim() ? WHITE : GREY3} />
                }
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },

  // Loading
  loadWrap:  { flex: 1, backgroundColor: WHITE },
  loadInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loadIcon:  {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: GOLD_L, justifyContent: 'center', alignItems: 'center',
  },
  loadText:  { marginTop: 12, fontSize: 15, color: GREY2 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: WHITE,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo:  { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: GREY1 },
  onlineRow:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  onlineLabel: { fontSize: 12, color: GREEN, fontWeight: '500' },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    shadowColor: GOLD, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  callBtnText: { color: WHITE, fontWeight: '700', fontSize: 13 },

  // Contact banner
  contactBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GOLD_L,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8D57E',
  },
  contactItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  contactIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: WHITE, justifyContent: 'center', alignItems: 'center',
  },
  contactText:    { fontSize: 13, fontWeight: '600', color: GOLD_D, flexShrink: 1 },
  contactDivider: {
    width: StyleSheet.hairlineWidth, height: 24,
    backgroundColor: '#E8D57E', marginHorizontal: 8,
  },

  // FAQ
  faqSection: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
    paddingTop: 10, paddingBottom: 10,
  },
  faqLabel: {
    fontSize: 11, fontWeight: '600', color: GREY3,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, marginBottom: 8,
  },
  faqScroll: { paddingHorizontal: 16, gap: 8 },
  faqChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: WHITE,
    borderRadius: 20, borderWidth: 1.5, borderColor: GOLD,
    maxWidth: 200,
  },
  faqChipText: { fontSize: 13, color: GOLD_D, fontWeight: '600' },

  // Messages
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, flexGrow: 1 },
  msgRow:      { flexDirection: 'row', marginBottom: 2, alignItems: 'flex-end' },
  msgRowMe:    { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },

  avatarSpace: { width: 30, marginRight: 6, alignItems: 'center', justifyContent: 'flex-end' },
  botAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center',
  },

  bubbleWrap:      { maxWidth: '78%' },
  bubbleWrapMe:    { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },
  bubble:         { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  bubbleMe:       { borderBottomRightRadius: 4 },
  bubbleBot:      { backgroundColor: BG, borderBottomLeftRadius: 4 },
  bubbleTextMe:   { fontSize: 15, lineHeight: 22, color: WHITE },
  bubbleTextBot:  { fontSize: 15, lineHeight: 22, color: GREY1 },

  timeText: { fontSize: 11, color: GREY3, marginTop: 3, marginBottom: 6 },
  timeMe:   { textAlign: 'right', paddingRight: 2 },
  timeBot:  { textAlign: 'left',  paddingLeft: 2 },

  // Date sep
  dateSep:      { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 8 },
  dateLine:     { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  dateBadge:    { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: BG, borderRadius: 10 },
  dateBadgeText:{ fontSize: 12, color: GREY2, fontWeight: '500' },

  // Empty state
  emptyState:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: GOLD_L, justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: GREY1, marginBottom: 8, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: GREY2, textAlign: 'center', lineHeight: 20 },

  // Bot option pills
  botOptWrap:   { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, paddingVertical: 10 },
  botOptScroll: { paddingHorizontal: 12, gap: 8 },
  botOptPill:   {
    backgroundColor: GOLD_L, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E8D57E',
    paddingVertical: 8, paddingHorizontal: 14,
  },
  botOptText: { color: GOLD_D, fontWeight: '600', fontSize: 13 },

  // Input bar — no manual bottom inset; SafeAreaView edges=['bottom'] handles it
  inputContainer: {
    backgroundColor: WHITE,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
    paddingTop: 10, paddingBottom: 10, paddingHorizontal: 12,
  },
  inputInner: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: BG,
    borderRadius: 24, borderWidth: 1.5, borderColor: BORDER,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    gap: 8, minHeight: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 16, color: GREY1,
    maxHeight: 120,
    paddingTop:    Platform.OS === 'ios' ? 6 : 4,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-end',
  },
  sendBtnOff: {
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER,
  },
});

export default SupportScreen;
