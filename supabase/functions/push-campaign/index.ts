// supabase/functions/push-campaign/index.ts
//
// PURPOSE: Send a scheduled push campaign to all (or targeted) users.
// Supports: puns, weekly stats, system announcements, custom messages.
//
// CALLED BY:
//   - Supabase pg_cron schedule (e.g. daily pun delivery)
//   - Dashboard admin API call to trigger a campaign
//
// PAYLOAD (POST body):
// {
//   campaign_id?: string;       // If running a saved campaign from push_campaigns table
//   type: 'pun' | 'stat' | 'announcement' | 'custom';
//   title: string;
//   body: string;
//   target: 'all' | 'students' | 'landlords';
//   schedule_for?: string;      // ISO timestamp, optional. If omitted, sends immediately.
// }
//
// CAMPAIGN TABLE (push_campaigns):
// id, type, title, body, target, status ('pending'|'sent'|'failed'), scheduled_at, sent_at, recipient_count

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Built-in Pun Library ───────────────────────────────────────────
const DHUB_PUNS = [
  { title: "🏠 DHUB Pun of the Day", body: "Why did the student love DHUB? Because it was a rent-astic deal!" },
  { title: "🏠 DHUB Pun of the Day", body: "Looking for a place? Don't worry, we've got you covered — floor to ceiling!" },
  { title: "🏠 DHUB Pun of the Day", body: "Our listings are so hot, even the A/C is jealous. 🔥" },
  { title: "🏠 DHUB Pun of the Day", body: "Why did the landlord love DHUB? Because it always brought good tenants to the door!" },
  { title: "🏠 DHUB Pun of the Day", body: "Finding your next home on DHUB: easier than finding your keys in the morning. 🗝️" },
  { title: "🏠 DHUB Pun of the Day", body: "A house is just a building, but DHUB makes it home. ✨" },
  { title: "🏠 DHUB Pun of the Day", body: "Don't just live anywhere — live somewhere legendary. Open DHUB now!" },
  { title: "🏠 DHUB Pun of the Day", body: "Your next chapter starts with the right address. We know where it is 😏" },
  { title: "🏠 DHUB Pun of the Day", body: "Good places go faster than free pizza on campus. Don't sleep on DHUB! 🍕" },
  { title: "🏠 DHUB Pun of the Day", body: "Looking for a room with a view? We've got rooms with reviews! ⭐" },
  { title: "🏠 DHUB Pun of the Day", body: "Home is where the WiFi connects automatically. Find yours on DHUB 📶" },
  { title: "🏠 DHUB Pun of the Day", body: "Moving tip: pack your bags. We've already found the house 😎" },
  { title: "🏠 DHUB Pun of the Day", body: "The early bird gets the listing. Open DHUB before your classmates do 🐦" },
  { title: "🏠 DHUB Pun of the Day", body: "New listings just dropped. Your future landlord is waiting. 🏘️" },
];

const SM_LINKS = "\n\nFollow us for more updates:\n[IG](https://www.instagram.com/dhub_cmr/) • [TikTok](https://www.tiktok.com/@dhub_cmr/) • [FB](https://www.facebook.com/share/18dc23F6Av/)\n[LinkedIn](https://www.linkedin.com/company/dhub-cmr/) • [YouTube](https://www.youtube.com/@DHUB_CMR)";

// ─── Weekly Stats Messages ───────────────────────────────────────────
async function buildStatsPushMessage(): Promise<{ title: string; body: string }> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [listingsRes, bookingsRes, usersRes] = await Promise.all([
    supabase.from("listings").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo.toISOString()),
    supabase.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo.toISOString()),
    supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo.toISOString()),
  ]);

  const listings = listingsRes.count ?? 0;
  const bookings = bookingsRes.count ?? 0;
  const users = usersRes.count ?? 0;

  return {
    title: "📊 DHUB This Week",
    body: `${listings} new listings, ${bookings} bookings made, ${users} new members joined the DHUB family this week! 🚀`,
  };
}

// ─── Main Handler ────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));

    let { campaign_id, type, title, body: msgBody, target = "all" } = body as {
      campaign_id?: string;
      type: "pun" | "stat" | "announcement" | "custom";
      title?: string;
      body?: string;
      target?: "all" | "students" | "landlords";
    };

    // ── If campaign_id provided, load from push_campaigns table ──
    if (campaign_id) {
      const { data: campaign, error } = await supabase
        .from("push_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .eq("status", "pending")
        .single();

      if (error || !campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found or already sent." }), { status: 404 });
      }
      type = campaign.type;
      title = campaign.title;
      msgBody = campaign.body;
      target = campaign.target;
    }

    // ── Resolve message content based on type ──
    if (type === "pun") {
      // Pick a random pun (or rotate by day-of-week for deterministic scheduling)
      const dayIndex = new Date().getDay(); // 0-6
      const pun = DHUB_PUNS[dayIndex % DHUB_PUNS.length];
      title = title || pun.title;
      msgBody = msgBody || pun.body;
    } else if (type === "stat") {
      const stats = await buildStatsPushMessage();
      title = title || stats.title;
      msgBody = msgBody || stats.body;
    }

    if (!title || !msgBody) {
      return new Response(JSON.stringify({ error: "Missing title or body for campaign." }), { status: 400 });
    }

    // Append SM links to the body
    const fullBody = msgBody + SM_LINKS;

    // ── Fetch target users ──
    let userQuery = supabase.from("users").select("id").eq("is_active", true);
    if (target === "students") userQuery = userQuery.eq("role", "student");
    if (target === "landlords") userQuery = userQuery.eq("role", "landlord");

    const { data: users, error: usersError } = await userQuery;
    if (usersError || !users?.length) {
      return new Response(JSON.stringify({ error: "No target users found." }), { status: 400 });
    }

    console.log(`[push-campaign] Sending '${type}' campaign to ${users.length} users. Title: ${title}`);

    // ── Batch-fetch push tokens ──
    const tokenMap: Record<string, string> = {};
    for (const u of users) {
      const { data: { user } } = await supabase.auth.admin.getUserById(u.id);
      if (user?.user_metadata?.expo_push_token) {
        tokenMap[u.id] = user.user_metadata.expo_push_token;
      }
    }

    // ── Build Expo push messages ──
    const messages: any[] = [];
    const notifRows: any[] = [];

    for (const u of users) {
      const token = tokenMap[u.id];
      if (!token) continue;

      messages.push({
        to: token,
        title,
        body: fullBody,
        sound: "default",
        data: { type: type === "pun" || type === "stat" ? "system_announcement" : type },
        channelId: "default",
      });

      notifRows.push({
        recipient_id: u.id,
        recipient_role: target === "landlords" ? "landlord" : "student",
        title,
        body: fullBody,
        type: "system_announcement",
        push_sent: true, // We're sending now
        push_sent_at: new Date().toISOString(),
      });
    }

    // ── Send to Expo in chunks of 100 ──
    let totalSent = 0;
    const CHUNK = 100;
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
        body: JSON.stringify(chunk),
      });

      if (res.ok) {
        totalSent += chunk.length;
      } else {
        console.error(`[push-campaign] Expo chunk ${i} failed:`, await res.text());
      }
    }

    // ── Save notification rows to DB (for in-app bell) ──
    if (notifRows.length > 0) {
      // Insert in chunks to avoid payload limits
      for (let i = 0; i < notifRows.length; i += 500) {
        await supabase.from("notifications").insert(notifRows.slice(i, i + 500));
      }
    }

    // ── Mark campaign as sent if campaign_id was provided ──
    if (campaign_id) {
      await supabase
        .from("push_campaigns")
        .update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: totalSent })
        .eq("id", campaign_id);
    }

    console.log(`[push-campaign] Done. Sent ${totalSent} pushes, saved ${notifRows.length} in-app notifications.`);
    return new Response(JSON.stringify({ success: true, sent: totalSent, in_app_saved: notifRows.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("[push-campaign] Fatal error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
