// src/services/supportService.ts
import { supabase } from '../utils/supabaseClient';
import { Ticket, Chat, FAQ } from '../types';

const EDGE_FUNCTION_URL = 'https://lpdszzdmhzrowtppngjb.supabase.co/functions/v1/support-bot';

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
    .single();

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
 * Sends a chat message AND calls Edge Function to get bot reply/options.
 * Returns both the user message and optional bot reply.
 */
export async function sendChatMessageWithBot(payload: {
  ticket_id: string;
  sender_id: string;
  message: string;
}): Promise<{ userMessage: Chat; botReply?: Chat; options?: string[] }> {
  // 1️⃣ Persist user message
  const { data: userMessage, error: userError } = await supabase
    .from('chats')
    .insert([
      {
        ticket_id: payload.ticket_id,
        sender_id: payload.sender_id,
        receiver_id: null,
        message: payload.message,
        read: false,
        sender_type: 'user',
        chat_type: 'support',
        is_complaint: false,
        is_faq_candidate: false,
      },
    ])
    .select()
    .single();

  if (userError || !userMessage) throw userError ?? new Error('Failed to insert user message');

  let botReply: Chat | undefined;
  let options: string[] | undefined;

  try {
    // 2️⃣ Call Edge Function for instant bot response
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: payload.ticket_id,
        user_id: payload.sender_id,
        message: payload.message,
      }),
    });

    const data = await res.json();
    if (data?.botData) {
      botReply = data.botData as Chat;
    }
    if (data?.options) {
      options = data.options as string[];
    }
  } catch (err) {
    console.error('Edge function error:', err);
  }

  return { userMessage: userMessage as Chat, botReply, options };
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
