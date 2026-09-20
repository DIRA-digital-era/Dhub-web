// src/services/supportService.ts
import { Chat, FAQ, Ticket } from '../types';
import { supabase } from '../utils/supabaseClient';

const EDGE_FUNCTION_URL = 'https://lpdszzdmhzrowtppngjb.supabase.co/functions/v1/support-bot';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// =========================
// TICKETS
// =========================
export async function fetchLatestTicket(userId: string): Promise<Ticket | null> {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function createTicket(userId: string): Promise<Ticket> {
  const { data, error } = await supabase
    .from('tickets')
    .insert([{ user_id: userId, status: 'open', priority: 'normal' }])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data as Ticket;
}

// =========================
// CHATS
// =========================
export async function fetchChats(ticketId: string): Promise<Chat[]> {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as Chat[];
}

/**
 * Sends a chat message via the Edge Function, which:
 * 1. Persists the user message (avoids double-insert)
 * 2. Always auto-replies with a bot response
 * 3. Notifies admin via email (Resend)
 */
export async function sendChatMessageWithBot(payload: {
  ticket_id: string;
  sender_id: string;
  message: string;
}): Promise<{ userMessage: Chat; botReply?: Chat; options?: string[] }> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      ticket_id: payload.ticket_id,
      user_id: payload.sender_id,
      message: payload.message,
    }),
  });

  if (!res.ok) {
    throw new Error(`Support bot edge function returned ${res.status}`);
  }

  const data = await res.json();

  // Edge function saves the user message and returns it
  const userMessage: Chat = data.userMsg ?? {
    ticket_id: payload.ticket_id,
    sender_id: payload.sender_id,
    message: payload.message,
    sender_type: 'user',
    chat_type: 'support',
    read: false,
  } as any;

  const botReply: Chat | undefined = data.botData ?? undefined;
  const options: string[] | undefined = data.options ?? undefined;

  return { userMessage, botReply, options };
}

// =========================
// FAQ CACHE
// =========================
export async function fetchFaqs(limit = 10): Promise<FAQ[]> {
  const { data, error } = await supabase
    .from('faq_cache')
    .select('*')
    .limit(limit);

  if (error) throw error;
  return (data || []) as FAQ[];
}
