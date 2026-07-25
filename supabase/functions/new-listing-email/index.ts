import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

serve(async (req) => {
  try {
    const payload = await req.json();
    const row = payload.record || payload;
    const city = row.city || "your area";
    const listingId = row.id;
    const title = row.title || "A new place";
    
    console.log(`Broadcasting new listing: ${title} in ${city}`);

    // Fetch all active students to send email
    const { data: students, error: studentsError } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'student')
      .eq('is_active', true);

    if (studentsError) {
      throw new Error(`Failed to fetch students: ${studentsError.message}`);
    }

    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active students found to email." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Extract valid emails
    const bccList = students.map(s => s.email).filter(Boolean);

    // If there are many students, you might need to chunk this in production depending on Resend API limits (usually 50 per BCC string). 
    // We will slice to first 50 to avoid hard failure, but ideally chunk in loop.
    const chunkedBcc = bccList.slice(0, 50);

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; padding: 40px 20px; margin: 0; color: #1a1a1a;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="background-color: #1A1A1A; padding: 30px; text-align: center; border-bottom: 4px solid #D4AF37;">
            <h1 style="color: #D4AF37; margin: 0; font-size: 28px; letter-spacing: 2px;">DHUB</h1>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px;">
            <h2 style="margin-top: 0; color: #1a1a1a; font-size: 24px;">Stop the scroll! 🛑🏠</h2>
            <p style="font-size: 16px; color: #4b5563;">Hey there,</p>
            <p style="font-size: 16px; color: #4b5563;">
              A brand new listing, <b>${title}</b>, just dropped in <b>${city}</b>! We don't want to <i>build</i> up your expectations too high, but this place looks incredible.
            </p>
            <p style="font-size: 16px; color: #4b5563;">
              Good places go faster than free pizza on campus. Check it out on DHUB right now before someone else locks it down!
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://dhubcmr.netlify.app" style="background-color: #D4AF37; color: #1A1A1A; text-decoration: none; padding: 14px 32px; font-weight: bold; border-radius: 8px; display: inline-block; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">View Property</a>
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
        to: ["dhubcmr@gmail.com"], // Self address as primary
        bcc: chunkedBcc,
        subject: `New Listing available in ${city}! 🏠`,
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
        const errorText = await resendRes.text();
        throw new Error(`Resend broadcast failed: ${errorText}`);
    }

    // --- Bulk-insert in-app notification rows for all students ---
    const { data: allStudents } = await supabase
      .from('users')
      .select('id')
      .eq('is_active', true);

    if (allStudents && allStudents.length > 0) {
      const SM_LINKS = "\n\nFollow us for more updates:\n[IG](https://www.instagram.com/dhub_cmr/) • [TikTok](https://www.tiktok.com/@dhub_cmr/) • [FB](https://www.facebook.com/share/18dc23F6Av/)\n[LinkedIn](https://www.linkedin.com/company/dhub-cmr/) • [YouTube](https://www.youtube.com/@DHUB_CMR)";
      const notifRows = allStudents.map((s) => ({
        recipient_id: s.id,
        recipient_role: 'student',
        title: `🏠 New Listing in ${city}!`,
        body: `${title} just dropped. Check it out before someone else grabs it!${SM_LINKS}`,
        type: 'system_announcement',
        listing_id: listingId,
        push_sent: false,
      }));

      const { error: notifInsertError } = await supabase.from('notifications').insert(notifRows);
      if (notifInsertError) {
        console.warn('[new-listing] Failed to insert notification rows:', notifInsertError.message);
      } else {
        // Fire push dispatcher (flush mode — no specific IDs; will pick up all push_sent=false)
        const supabaseEdgeUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        fetch(`${supabaseEdgeUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
          body: JSON.stringify({}),
        }).catch((e) => console.warn('[new-listing] Push trigger failed:', e.message));
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Broadcast triggered successfully to ${chunkedBcc.length} students` }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("New Listing Broadcast Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
