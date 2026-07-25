// src/services/chatService.ts
import { supabase } from '../utils/supabaseClient';
import { ChatMessageDto, User, ThreadDto } from '../types';
import { saveUserProfile } from './userCache';
import uuid from 'react-native-uuid';
import { triggerPushNotifications } from '../hooks/usePushNotifications';

/* ------------------------------------------------------------------
   FETCH USER THREADS
------------------------------------------------------------------ */

export async function fetchUserThreads(userId: string, limit = 50): Promise<ThreadDto[]> {
  try {
    const { data: threads, error: threadErr } = await supabase
      .from('threads')
      .select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (threadErr) throw threadErr;
    if (!threads || threads.length === 0) return [];

    const threadIds = threads.map(t => t.id);

    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('thread_id, body, created_at, sender_id, is_read')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });

    if (msgErr) throw msgErr;

    const otherUserIds = threads.map(t => t.user1_id === userId ? t.user2_id : t.user1_id);
    const { data: otherUsers } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', otherUserIds);

    const userMap = new Map(otherUsers?.map(u => [u.id, u]) || []);
    const lastMessageMap = new Map<string, { body: string; created_at: string }>();
    const unreadCounts: Record<string, number> = {};

    messages?.forEach((m) => {
      if (!lastMessageMap.has(m.thread_id)) {
        lastMessageMap.set(m.thread_id, { body: m.body, created_at: m.created_at });
      }
      if (!m.is_read && m.sender_id !== userId) {
        unreadCounts[m.thread_id] = (unreadCounts[m.thread_id] || 0) + 1;
      }
    });

    return threads.map((t) => {
      const otherId = t.user1_id === userId ? t.user2_id : t.user1_id;
      const userObj = userMap.get(otherId);

      const participant: User = {
        id: otherId,
        fullName: userObj?.full_name || 'Unknown User',
        email: userObj?.email || '',
        role: 'student',
      };

      if (userObj) saveUserProfile(participant);

      const last = lastMessageMap.get(t.id);

      return {
        threadId: t.id,
        participants: [participant],
        lastMessage: last?.body || null,
        lastMessageTime: last?.created_at || null,
        unreadCount: unreadCounts[t.id] || 0,
      };
    });

  } catch (err) {
    console.error('fetchUserThreads error:', err);
    return [];
  }
}

/* ------------------------------------------------------------------
   FETCH THREAD MESSAGES
------------------------------------------------------------------ */

export async function fetchThreadMessages(
  threadId: string,
  limit = 50
): Promise<ChatMessageDto[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data as ChatMessageDto[];
}

/* ------------------------------------------------------------------
   SEND MESSAGE & MASKING (WITH CONTEXT BUFFER)
------------------------------------------------------------------ */

// In-memory sliding window buffer: threadId -> senderId -> string[]
const contextBuffer = new Map<string, Map<string, string[]>>();

function maskMessage(body: string, threadId: string, senderId: string): { masked: string; flagged: boolean } {
  let flagged = false;
  let masked = body;

  // 1. Maintain context buffer (last 5 messages per sender per thread)
  if (!contextBuffer.has(threadId)) {
    contextBuffer.set(threadId, new Map());
  }
  const threadBuffer = contextBuffer.get(threadId)!;
  if (!threadBuffer.has(senderId)) {
    threadBuffer.set(senderId, []);
  }
  const recentMessages = threadBuffer.get(senderId)!;
  
  // Add current message to buffer (stripping spaces for concatenation)
  recentMessages.push(body.replace(/\s+/g, ''));
  if (recentMessages.length > 5) {
    recentMessages.shift(); // Keep only last 5
  }

  const concatenatedContext = recentMessages.join('');

  // 2. Check Context Buffer for Fragmented Phone Numbers
  const phoneContextRegex = /(?:\+?237[\s\-.]?)?(?:6|2)[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2}|\b\d{9,}\b/gi;
  if (phoneContextRegex.test(concatenatedContext)) {
    flagged = true;
    masked = "[HIDDEN_PHONE]";
    // Clear buffer after catching so we don't keep flagging
    threadBuffer.set(senderId, []); 
  }

  // 3. Normal Per-Message Checks
  
  // Mask Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  if (emailRegex.test(masked)) {
    flagged = true;
    masked = masked.replace(emailRegex, '[HIDDEN_EMAIL]');
  }

  // Mask Phone numbers (Cameroon specific or generic 9+ digits)
  const phoneRegex = /(?:\+?237[\s\-.]?)?(?:6|2)[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2}|\b\d{9,}\b/g;
  if (phoneRegex.test(masked)) {
    flagged = true;
    masked = masked.replace(phoneRegex, '[HIDDEN_PHONE]');
  }

  // Mask URLs
  const urlRegex = /https?:\/\/[^\s]+/g;
  if (urlRegex.test(masked)) {
    flagged = true;
    masked = masked.replace(urlRegex, '[HIDDEN_URL]');
  }

  // Flag extended keywords (Bypass attempts)
  const keywords = /\b(cash|whatsapp|wa|momo|orange money|call me|outside|off app|off platform|out of app|take this outside|transaction outside|meet me|my number|phone number|contact me|telegram|instagram dm|pay cash|pay directly|off the record|between us)\b/gi;
  if (keywords.test(masked)) {
    flagged = true;
    masked = masked.replace(keywords, '[BLOCKED_TERM]');
  }

  return { masked, flagged };
}

export async function sendMessage(
  senderId: string,
  threadId: string,
  body: string
): Promise<ChatMessageDto> {
  const { masked, flagged } = maskMessage(body, threadId, senderId);

  if (flagged) {
    try {
      await supabase.from('suspensions').insert({
        user_id: senderId,
        reason: 'Detected off-platform dealing attempt in chat.',
        is_active: true, // Mark active so admins can review
      });
    } catch (e) {
      console.error('Failed to log suspension flag', e);
    }
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      body: masked,
      is_read: false,
      created_at: new Date().toISOString(), // Use client-side timestamp
    })
    .select()
    .single();

  if (error) {
    console.error('sendMessage error:', error);
    throw error;
  }
  
  if (flagged) {
    // Send a system warning bubble immediately after
    try {
      await supabase.from('messages').insert({
        thread_id: threadId,
        sender_id: '00000000-0000-0000-0000-000000000000', // Assuming all zeros is a system user, or just rely on the UI to style it differently if sender doesn't exist
        body: "⚠️ System Notice: Your message contained content that violates DHUB's off-platform communication policy and has been hidden. Repeated attempts to bypass the platform may result in account suspension.",
        is_read: false,
        created_at: new Date(Date.now() + 1000).toISOString(), // 1 second later
      });
    } catch (e) {
      console.error('Failed to send system warning bubble', e);
    }
  }

  // Trigger push notifications
  triggerPushNotifications();

  return data as ChatMessageDto;
}

/* ------------------------------------------------------------------
   MARK MESSAGES READ
------------------------------------------------------------------ */

export async function markMessagesRead(
  threadId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('thread_id', threadId)
    .neq('sender_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('markMessagesRead error:', error);
  }
}

/* ------------------------------------------------------------------
   REALTIME SUBSCRIPTION
------------------------------------------------------------------ */

export function subscribeToThread(
  threadId: string,
  onNewMessage: (msg: ChatMessageDto) => void,
  onMessageUpdated?: (msg: ChatMessageDto) => void
) {
  const channel = supabase
    .channel(`thread-${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        onNewMessage(payload.new as ChatMessageDto);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        if (onMessageUpdated) {
          onMessageUpdated(payload.new as ChatMessageDto);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToThreads(
  userId: string,
  onUpdate: () => void
) {
  // Listen for any changes in the threads table for this user
  const channel = supabase
    .channel(`user-threads-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'threads' },
      () => onUpdate() 
    )
    .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => onUpdate() // Refresh if any message is sent (ideally filtered by user's threads)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* ------------------------------------------------------------------
   UNREAD COUNT
------------------------------------------------------------------ */

export async function fetchThreadUnreadCount(threadId: string, userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: false })
      .eq('thread_id', threadId)
      .eq('is_read', false)
      .neq('sender_id', userId);

    if (error) throw error;
    return (count as number) || 0;
  } catch (err) {
    console.error('fetchThreadUnreadCount error:', err);
    return 0;
  }
}

export async function fetchTotalUnreadCount(userId: string): Promise<number> {
  try {
    const threads = await fetchUserThreads(userId, 100);
    return threads.reduce((acc, t) => acc + t.unreadCount, 0);
  } catch (err) {
    console.error('fetchTotalUnreadCount error:', err);
    return 0;
  }
}

/* ------------------------------------------------------------------
   GET OR CREATE THREAD
------------------------------------------------------------------ */

export async function getOrCreateThread(userId1: string, userId2: string): Promise<string> {
  try {
    const { data: existing, error: findErr } = await supabase
      .from('threads')
      .select('id')
      .or(`and(user1_id.eq.${userId1},user2_id.eq.${userId2}),and(user1_id.eq.${userId2},user2_id.eq.${userId1})`)
      .limit(1)
      .maybeSingle();

    if (existing) return existing.id;

    const newThreadId = uuid.v4() as string;

    const { error: insertErr } = await supabase
      .from('threads')
      .insert([{
        id: newThreadId,
        user1_id: userId1,
        user2_id: userId2
      }]);

    if (insertErr) {
      console.error('Failed to create thread:', insertErr);
      throw insertErr;
    }

    return newThreadId;
  } catch (err) {
    console.error('getOrCreateThread error:', err);
    throw err;
  }
}

/* ------------------------------------------------------------------
   GET THREAD PARTICIPANT INFO
------------------------------------------------------------------ */

export async function getThreadParticipantInfo(
  threadId: string,
  currentUserId: string
): Promise<User> {
  try {
    const { data: thread, error } = await supabase
      .from('threads')
      .select('user1_id, user2_id')
      .eq('id', threadId)
      .single();

    if (error) throw error;

    const otherUserId = thread.user1_id === currentUserId ? thread.user2_id : thread.user1_id;

    const { data: userRow } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', otherUserId)
      .single();

    const result: User = {
      id: otherUserId,
      fullName: userRow?.full_name || 'Unknown User',
      email: userRow?.email || '',
      role: 'student',
    };

    saveUserProfile(result);
    return result;

  } catch (err) {
    console.error('getThreadParticipantInfo error:', err);
    return {
      id: '',
      fullName: 'Unknown User',
      email: '',
      role: 'student',
    };
  }
}

export async function debugAuthJwt() {
  const { data, error } = await supabase.rpc('test_authorization_header');
  console.log('JWT info', data, error);
}
