// supabase/functions/support-bot/index.ts
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Env variables (Supabase sets automatically in edge functions)
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface RequestBody {
  ticket_id: string;
  user_id: string;
  message: string;
}

serve(async (req: Request) => {
  try {
    const body: RequestBody = await req.json();
    const { ticket_id, user_id, message } = body;

    if (!ticket_id || !user_id || !message) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
    }

    // --- Simple trigger logic ---
    const greetingTriggers = ["hi", "hello", "hey"];
    const lowerMsg = message.toLowerCase().trim();

    let botReply: string | null = null;
    let options: string[] = [];

    if (greetingTriggers.includes(lowerMsg)) {
      botReply = "Welcome to DHUB Support! How can we help?";
      options = ["Failed payment", "Account issue", "Report a bug", "Other"];
    }

    // --- Persist user message ---
    await supabase.from("chats").insert([{
      ticket_id,
      sender_id: user_id,
      receiver_id: null,
      message,
      read: false,
      sender_type: "user",
      chat_type: "support",
      is_complaint: false,
      is_faq_candidate: false
    }]);

    let botData = null;
    if (botReply) {
      const { data: botMessage } = await supabase.from("chats").insert([{
        ticket_id,
        sender_id: null, // null for system/bot
        receiver_id: user_id,
        message: botReply,
        read: false,
        sender_type: "admin",
        chat_type: "support",
        is_complaint: false,
        is_faq_candidate: false
      }]).select().single();

      botData = botMessage;
    }

    return new Response(JSON.stringify({ botReply, options, botData }), { status: 200 });
  } catch (err) {
    console.error("Support bot error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
});
