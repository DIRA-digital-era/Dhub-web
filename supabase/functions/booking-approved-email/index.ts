import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

serve(async (req) => {
  try {
    const payload = await req.json();
    // In Supabase Webhooks, the payload differs from direct calls. It usually wraps inside 'record'.
    // E.g., payload.record contains the NEW row if triggered from Database.
    const row = payload.record || payload; 
    const studentId = row.student_id;
    const bookingId = row.id;
    
    console.log(`Processing booking approval for Booking ID: ${bookingId}, Student: ${studentId}`);

    if (!studentId) throw new Error("No student_id found in payload");

    // Fetch the student's email
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', studentId)
      .single();

    if (userError || !userData?.email) {
      throw new Error(`Could not fetch student email for id ${studentId}: ${userError?.message}`);
    }

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; padding: 40px 20px; margin: 0; color: #1a1a1a;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="background-color: #1A1A1A; padding: 30px; text-align: center; border-bottom: 4px solid #D4AF37;">
            <h1 style="color: #D4AF37; margin: 0; font-size: 28px; letter-spacing: 2px;">DHUB</h1>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px;">
            <h2 style="margin-top: 0; color: #1a1a1a; font-size: 24px;">Knock knock! Great news... 🚪✨</h2>
            <p style="font-size: 16px; color: #4b5563;">Hey <b>${userData.full_name || 'there'}</b>,</p>
            <p style="font-size: 16px; color: #4b5563;">
              Your booking has officially been <b>APPROVED</b> by the landlord! We aren't trying to <i>push your buttons</i>, but the keys to your new place are basically in your hands. 
            </p>
            <p style="font-size: 16px; color: #4b5563;">
              To lock things down, hop back into DHUB and securely complete your payment. If you do not confirm within 24hours, the booking will expire and you'd have to book again. Properties move fast, so don't sleep on this!
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://dhubcmr.netlify.app" style="background-color: #D4AF37; color: #1A1A1A; text-decoration: none; padding: 14px 32px; font-weight: bold; border-radius: 8px; display: inline-block; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Complete Your Bookings</a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 15px 0;">Chat soon,<br/><b>Marie from DHUB</b></p>
            
            <div style="margin-top: 20px;">
              <a href="https://www.instagram.com/dhub_cmr/" style="color: #D4AF37; text-decoration: none; margin: 0 10px; font-weight: bold;">IG</a> • 
              <a href="https://www.tiktok.com/@dhub_cmr/" style="color: #D4AF37; text-decoration: none; margin: 0 10px; font-weight: bold;">TikTok</a> • 
              <a href="https://www.facebook.com/share/18dc23F6Av/?mibextid=wwXIfr" style="color: #D4AF37; text-decoration: none; margin: 0 10px; font-weight: bold;">Facebook</a><br/><br/>
              <a href="https://www.linkedin.com/company/dhub-cmr/" style="color: #D4AF37; text-decoration: none; margin: 0 10px; font-weight: bold;">LinkedIn</a> • 
              <a href="https://www.youtube.com/@DHUB_CMR" style="color: #D4AF37; text-decoration: none; margin: 0 10px; font-weight: bold;">YouTube</a>
            </div>
            
            <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
              Got questions? Give us a ring at +237 682 366 472<br/>
              © 2026 DIRA Digital Era. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Marie from DHUB <onboarding@resend.dev>",
        to: [userData.email],
        subject: "Your Booking is Approved! 🎉",
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
        const errorText = await resendRes.text();
        throw new Error(`Resend email failed: ${errorText}`);
    }

    const SM_LINKS = "\n\nFollow us for more updates:\n[IG](https://www.instagram.com/dhub_cmr/) • [TikTok](https://www.tiktok.com/@dhub_cmr/) • [FB](https://www.facebook.com/share/18dc23F6Av/)\n[LinkedIn](https://www.linkedin.com/company/dhub-cmr/) • [YouTube](https://www.youtube.com/@DHUB_CMR)";

    // --- Insert in-app notification row ---
    const { data: notifRow, error: notifError } = await supabase
      .from('notifications')
      .insert({
        recipient_id: studentId,
        recipient_role: 'student',
        title: '🎉 Booking Approved!',
        body: `Your booking has been approved by your landlord. Complete your payment within 24 hours to secure it.${SM_LINKS}`,
        type: 'booking_update',
        booking_id: bookingId,
        push_sent: false,
      })
      .select('id')
      .single();

    // --- Trigger push notification ---
    if (!notifError && notifRow?.id) {
      const supabaseEdgeUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      fetch(`${supabaseEdgeUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ notification_id: notifRow.id }),
      }).catch((e) => console.warn('[booking-approved] Push trigger failed:', e.message));
    }

    return new Response(JSON.stringify({ success: true, message: `Email triggered successfully to ${userData.email}` }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Booking Approval Edge Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
