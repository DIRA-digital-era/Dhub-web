// src/services/chatService.ts
import { supabase } from '../utils/supabaseClient';
import { ChatMessageDto, User, ThreadDto } from '../types';
import { saveUserProfile } from './userCache';
import uuid from 'react-native-uuid';

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
   SEND MESSAGE
------------------------------------------------------------------ */

export async function sendMessage(
  senderId: string,
  threadId: string,
  body: string
): Promise<ChatMessageDto> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      body,
      is_read: false,
      created_at: new Date().toISOString(), // Use client-side timestamp
    })
    .select()
    .single();

  if (error) {
    console.error('sendMessage error:', error);
    throw error;
  }

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
