import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const mediaBase = Deno.env.get("MEDIA_BASE_URL") || "https://listings.frunjimbong.workers.dev";

serve(async (req) => {
  const url = new URL(req.url);
  const listingId = url.searchParams.get("id");

  if (!listingId) {
    return new Response("Missing listing ID", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ✅ Include price_unit
  const { data: listing, error } = await supabase
    .from("listings")
    .select("title, price, city, media, description, price_unit")
    .eq("id", listingId)
    .single();

  if (error || !listing) {
    return new Response("Listing not found", { status: 404 });
  }

  // Build image URL
  let imageUrl = "";
  if (listing.media && Array.isArray(listing.media)) {
    const firstImage = listing.media.find((m: any) => m.type === "image");
    if (firstImage) {
      const imgUrl = firstImage.thumbUrl || firstImage.url;
      imageUrl = imgUrl?.startsWith("/media/") ? mediaBase + imgUrl : imgUrl || "";
    }
  }
  if (!imageUrl) imageUrl = "https://dhubweb.diracmr.com/icon.png";

  const title = listing.title;
  const priceUnit = listing.price_unit === "per_night" ? "night" : "month";
  const priceDisplay = listing.price ? `${listing.price.toLocaleString()} FCFA/${priceUnit}` : "";
  const description = `${listing.city || ""} • ${priceDisplay}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - DHUB</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:url" content="https://dhubweb.diracmr.com/listing/${listingId}" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; background: #f5f5f5; margin:0; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    img { max-width: 100%; border-radius: 8px; max-height: 300px; object-fit: cover; }
    h1 { color: #1a1a1a; font-size: 24px; }
    .price { font-size: 28px; color: #D4AF37; font-weight: bold; }
    .btn { background: #D4AF37; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    ${listing.city ? `<p>📍 ${listing.city}</p>` : ""}
    <p class="price">${priceDisplay || "Price not set"}</p>
    ${imageUrl ? `<img src="${imageUrl}" alt="${title}" />` : ""}
    <p>${listing.description ? listing.description.substring(0, 200) + "..." : ""}</p>
    <a href="https://dhubweb.diracmr.com/?listingId=${listingId}" class="btn">View on DHUB</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
});