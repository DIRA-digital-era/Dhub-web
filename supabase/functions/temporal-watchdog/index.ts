// supabase/functions/temporal-watchdog/index.ts
// Temporal Watchdog — Invoked daily by pg_cron at 10:00 WAT (09:00 UTC)
// Handles all push notification phases for lease lifecycle management.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, serviceKey);

interface Booking {
  id: string;
  end_date: string;
  contract_status: string;
  listing_id: string;
  student_id: string;
  landlord_id: string;
  listings: { title: string } | null;
  students: { full_name: string; expo_push_token?: string } | null;
  landlord:  { expo_push_token?: string } | null;
}

async function sendPush(token: string, title: string, body: string) {
  if (!token || !token.startsWith('ExponentPushToken')) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

Deno.serve(async (_req) => {
  try {
    const now = new Date();

    // ── Fetch all confirmed, active bookings that are in either
    //    the pre-expiry window (-30 to 0 days) or grace period (0 to +14 days)
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, end_date, contract_status, listing_id, student_id, landlord_id,
        listings ( title ),
        students:student_id ( full_name, expo_push_token ),
        landlord:landlord_id ( expo_push_token )
      `)
      .eq('status', 'confirmed')
      .in('contract_status', ['active', 'grace'])
      .gte('end_date', new Date(now.getTime() - 15 * 86400_000).toISOString())  // up to 15 days past
      .lte('end_date', new Date(now.getTime() + 31 * 86400_000).toISOString()); // up to 31 days ahead

    if (error) throw error;
    if (!bookings || bookings.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    let processed = 0;

    for (const booking of bookings as Booking[]) {
      const endDate   = new Date(booking.end_date);
      const daysUntil = Math.ceil((endDate.getTime() - now.getTime()) / 86400_000);
      const propertyName = booking.listings?.title ?? 'your property';
      const tenantToken  = booking.students?.expo_push_token ?? '';
      const landlordToken = booking.landlord?.expo_push_token ?? '';

      // ── PRE-EXPIRY: -30 days window ──────────────────────────────────────
      if (daysUntil === 30) {
        await sendPush(
          tenantToken,
          '📅 Lease Ending Soon',
          `Your stay at "${propertyName}" ends in 30 days. Tap to Extend or Plan your Move-Out.`
        );
      }

      // ── PRE-EXPIRY: -14 days urgency pulse (daily) ─────────────────────
      if (daysUntil >= 1 && daysUntil <= 14) {
        await sendPush(
          tenantToken,
          `⚠️ ${daysUntil} Days Left on Your Lease`,
          `Your stay at "${propertyName}" ends in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}. Pay to Renew or Confirm Move-Out now.`
        );
      }

      // ── GRACE PERIOD: Day 1-7 (Soft Grace) ─────────────────────────────
      if (daysUntil < 0 && daysUntil >= -7) {
        const daysOver = Math.abs(daysUntil);
        await sendPush(
          tenantToken,
          '🔴 Your Lease Has Expired',
          `Your stay at "${propertyName}" expired ${daysOver} day${daysOver !== 1 ? 's' : ''} ago. Pay the XAF 5,000 Rent Processing Fee to renew or confirm your move-out.`
        );
      }

      // ── GRACE PERIOD: Day 8-13 (Shadow Audit / Landlord Alert) ──────────
      if (daysUntil < -7 && daysUntil >= -13) {
        // Notify the landlord to watch for off-platform payments
        await sendPush(
          landlordToken,
          '🔍 Lease Expired — DHUB Monitoring Active',
          `Tenant at "${propertyName}" has not renewed via DHUB. Do NOT accept cash payments — this removes your legal protection.`
        );
        // Continue reminding the tenant
        const daysOver = Math.abs(daysUntil);
        await sendPush(
          tenantToken,
          '🔴 Urgent: Lease Expired',
          `${daysOver} days since your lease expired at "${propertyName}". Pay now to renew or the lease will be automatically terminated in ${14 - daysOver} day${14 - daysOver !== 1 ? 's' : ''}.`
        );
      }

      // ── GRACE PERIOD: Day 14 (Final Warning) ────────────────────────────
      if (daysUntil === -14) {
        await sendPush(
          tenantToken,
          '🚨 Final Warning — Lease Terminating Today',
          `Your lease at "${propertyName}" will be automatically terminated in a few hours. Pay to renew immediately or confirm your move-out.`
        );
        await sendPush(
          landlordToken,
          '🏠 Lease Auto-Terminating Today',
          `The lease at "${propertyName}" is being auto-terminated. Your listing will return to active shortly.`
        );
      }

      processed++;
    }

    return new Response(
      JSON.stringify({ processed, timestamp: now.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[temporal-watchdog] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
