import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

serve(async (req) => {
  try {
    console.log(`Starting Weekly DHUB Marketing Campaign Email...`);

    // 1. Fetch new listings from the last 7 days
    // Make sure 'created_at' exists on listings schema. Adjust if necessary (e.g. 'boost_until').
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const { data: newListings, error: listingsError } = await supabase
      .from('listings')
      .select('title, city, price')
      .eq('available', true)
      .gte('created_at', oneWeekAgo.toISOString())
      .limit(3);

    if (listingsError) throw new Error(`Failed to fetch listings: ${listingsError.message}`);
    
    if (!newListings || newListings.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No new listings this week. Skipping email." }), { status: 200 });
    }

    // Prepare preview block
    const listingsHtml = newListings.map(listing => `
      <div style="background-color: #f9fafb; padding: 15px; margin-bottom: 10px; border-left: 4px solid #D4AF37; border-radius: 4px;">
        <h3 style="margin: 0 0 5px 0; color: #1a1a1a;">${listing.title}</h3>
        <p style="margin: 0; color: #4b5563;">📍 ${listing.city} &nbsp; • &nbsp; 💰 ${listing.price} FCFA</p>
      </div>
    `).join('');

    // 2. Fetch all active students
    const { data: students, error: studentsError } = await supabase
      .from('users')
      .select('email')
      .eq('role', 'student')
      .eq('is_active', true);

    if (studentsError) throw new Error(`Failed to fetch students: ${studentsError.message}`);
    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No students to email." }), { status: 200 });
    }

    // 3. Batch emails via Resend
    const bccList = students.map(s => s.email).filter(Boolean);
    const chunkedBcc = bccList.slice(0, 50); // Slice due to basic Resend limits. Use loops in full enterprise prod.

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; padding: 40px 20px; margin: 0; color: #1a1a1a;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="background-color: #1A1A1A; padding: 30px; text-align: center; border-bottom: 4px solid #D4AF37;">
            <h1 style="color: #D4AF37; margin: 0; font-size: 28px; letter-spacing: 2px;">DHUB WEEKEND ROUNDUP</h1>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px;">
            <h2 style="margin-top: 0; color: #1a1a1a; font-size: 24px;">New places alert! 🚨</h2>
            <p style="font-size: 16px; color: #4b5563;">Hey there,</p>
            <p style="font-size: 16px; color: #4b5563;">
              We added <b>${newListings.length}${newListings.length >= 3 ? '+' : ''} new properties</b> to the DHUB app this week! 
              We don't want to <i>corner</i> you into a decision, but these homes are absolutely spectacular.
            </p>
            
            <div style="margin: 30px 0;">
              ${listingsHtml}
            </div>

            <p style="font-size: 16px; color: #4b5563;">
              Don't wait until Monday. Hop in the app and secure your new crib before it's gone!
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="https://dhubcmr.netlify.app" style="background-color: #D4AF37; color: #1A1A1A; text-decoration: none; padding: 14px 32px; font-weight: bold; border-radius: 8px; display: inline-block; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Explore Listings</a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 15px 0;">Have a great weekend,<br/><b>Marie from DHUB</b></p>
            
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
        subject: `🔥 ${newListings.length}+ New Listings Just Dropped!`,
        html: htmlContent,
      }),
    });

    if (!resendRes.ok) {
        const errorText = await resendRes.text();
        throw new Error(`Resend broadcast failed: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true, message: `Weekly marketing sent to ${chunkedBcc.length} students` }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Weekly Marketing Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
