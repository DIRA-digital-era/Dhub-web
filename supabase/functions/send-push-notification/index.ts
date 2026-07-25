// supabase/functions/send-push-notification/index.ts
// Central push notification dispatcher.
// Reads from the `notifications` table for rows where push_sent = false,
// fetches each recipient's expo_push_token from auth.users.user_metadata,
// and delivers the push via Expo's push API.
//
// TRIGGER: Call this function from any other Edge Function after inserting a notification row.
// Or call it on a schedule (e.g., every minute) to flush pending pushes.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    // --- OPTION A: Called with a specific notification_id (e.g. from booking-approved) ---
    let notificationIds: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.notification_id) {
        notificationIds = [body.notification_id];
      } else if (body?.notification_ids) {
        notificationIds = body.notification_ids;
      }
    } catch {
      // Body may be empty if called as a scheduled flush
    }

    // --- Fetch pending notifications ---
    let query = supabase
      .from("notifications")
      .select("id, recipient_id, title, body, type, listing_id, booking_id, data")
      .eq("push_sent", false);

    if (notificationIds?.length) {
      query = query.in("id", notificationIds);
    } else {
      // Flush mode: process up to 50 pending at a time
      query = query.limit(50);
    }

    const { data: pending, error: fetchError } = await query;
    if (fetchError) throw new Error(`Failed to fetch pending notifications: ${fetchError.message}`);
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No pending notifications." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`[send-push] Processing ${pending.length} notification(s)...`);

    // --- Batch-fetch push tokens via auth admin API ---
    const recipientIds = [...new Set(pending.map((n) => n.recipient_id))];

    // Use admin.listUsers to get user_metadata tokens
    const tokenMap: Record<string, string> = {};
    for (const userId of recipientIds) {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
      if (!error && user?.user_metadata?.expo_push_token) {
        tokenMap[userId] = user.user_metadata.expo_push_token;
      }
    }

    // --- Build Expo push messages ---
    const messages: any[] = [];
    const processedIds: string[] = [];

    for (const notif of pending) {
      const token = tokenMap[notif.recipient_id];
      if (!token) {
        console.warn(`[send-push] No token for user ${notif.recipient_id}, skipping.`);
        continue;
      }

      messages.push({
        to: token,
        title: notif.title,
        body: notif.body,
        sound: "default",
        data: {
          notificationId: notif.id,
          type: notif.type,
          listingId: notif.listing_id || undefined,
          bookingId: notif.booking_id || undefined,
          ...(notif.data || {}),
          recipientRole: notif.recipient_role,
        },
        channelId: "default",
      });
      processedIds.push(notif.id);
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No tokens available to send pushes." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // --- Send to Expo Push API (max 100 per request) ---
    const CHUNK_SIZE = 100;
    let totalSent = 0;
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      const expoRes = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });

      if (!expoRes.ok) {
        const errText = await expoRes.text();
        console.error(`[send-push] Expo API error for chunk ${i}: ${errText}`);
        continue;
      }

      const expoData = await expoRes.json();
      const ticketChunk = expoData.data || [];

      // Log any per-message failures from Expo
      ticketChunk.forEach((ticket: any, idx: number) => {
        if (ticket.status === "error") {
          console.error(`[send-push] Expo ticket error for msg ${i + idx}: ${ticket.message}`);
        }
      });

      totalSent += chunk.length;
    }

    // --- Mark notifications as push_sent in DB ---
    if (processedIds.length > 0) {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ push_sent: true, push_sent_at: new Date().toISOString() })
        .in("id", processedIds);

      if (updateError) {
        console.error("[send-push] Failed to update push_sent:", updateError.message);
      }
    }

    console.log(`[send-push] Done. Sent ${totalSent} push(es), marked ${processedIds.length} as sent.`);
    return new Response(JSON.stringify({ success: true, sent: totalSent, marked: processedIds.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[send-push] Fatal error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
