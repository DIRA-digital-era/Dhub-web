import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const mediaBase = Deno.env.get('MEDIA_BASE_URL') || 'https://listings.frunjimbong.workers.dev';

// NOTE: Update APP_STORE_URL when DHUB is live on App Store
const APP_STORE_URL = 'https://apps.apple.com/app/dhub/id000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.diracmr.dhub';
const WEB_BASE_URL = 'https://dhubweb.diracmr.com';
const SUPABASE_PROJECT_URL = 'https://lpdszzdmhzrowtppngjb.supabase.co';

/** XSS-safe HTML attribute/text escaping */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Professional inline SVG icons ──────────────────────────────────────────
const ICON_LOCATION = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`;

const ICON_ANDROID = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341 14.67 9.2l2.855-5.223a.5.5 0 0 0-.88-.48L13.82 8.66a8.28 8.28 0 0 0-3.64 0L7.355 3.497a.5.5 0 0 0-.88.48L9.33 9.2 6.477 15.34A3 3 0 0 0 6 17a6 6 0 0 0 12 0 3 3 0 0 0-.477-1.659zM9.5 19a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;

const ICON_APPLE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.37 2.83zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

const ICON_GLOBE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

const ICON_HOME = `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(212,175,55,0.35)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

serve(async (req) => {
  const url = new URL(req.url);
  const listingId = url.searchParams.get('id');
  if (!listingId) return new Response('Missing listing ID', { status: 400 });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: listing, error } = await supabase
    .from('listings')
    .select('title, price, city, media, description, price_unit, location')
    .eq('id', listingId)
    .single();

  if (error || !listing) return new Response('Listing not found', { status: 404 });

  // ── Image URL ────────────────────────────────────────────────────────────
  let imageUrl = '';
  if (listing.media && Array.isArray(listing.media)) {
    const firstImage = listing.media.find((m: any) => m.type === 'image');
    if (firstImage) {
      const imgUrl = firstImage.thumbUrl || firstImage.url;
      imageUrl = imgUrl?.startsWith('/media/') ? mediaBase + imgUrl : imgUrl || '';
    }
  }
  const fallbackImage = WEB_BASE_URL + '/icon.png';
  if (!imageUrl) imageUrl = fallbackImage;

  const title = listing.title || 'DHUB Listing';
  const priceUnit = listing.price_unit === 'per_night' ? 'night' : 'month';
  const priceDisplay = listing.price
    ? listing.price.toLocaleString('en-US') + ' FCFA/' + priceUnit
    : 'Price on request';
  const city = listing.city || listing.location || '';
  const ogDescription = city ? city + ' \u2022 ' + priceDisplay : priceDisplay;
  const shortDesc = listing.description
    ? listing.description.substring(0, 180) + '...'
    : 'Find your perfect home on DHUB.';

  const deepLink = 'dhub://listing/' + listingId;
  const webLink = WEB_BASE_URL + '/listing/' + listingId;
  // This edge function URL IS the canonical share URL — bots always crawl it and get OG tags
  const canonicalUrl = SUPABASE_PROJECT_URL + '/functions/v1/listing-og?id=' + listingId;

  const hasHeroImage = imageUrl && imageUrl !== fallbackImage;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - DHUB</title>

<!-- Open Graph: WhatsApp, Facebook, LinkedIn, Telegram, Discord, Slack -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="DHUB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(ogDescription)}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${canonicalUrl}">

<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(ogDescription)}">
<meta name="twitter:image" content="${imageUrl}">

<!-- iOS Smart App Banner -->
<meta name="apple-itunes-app" content="app-id=000000000, app-argument=${deepLink}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --gold: #D4AF37;
  --gold-dark: #b8962e;
  --bg: #09090f;
  --surface: #13131a;
  --surface2: #1c1c27;
  --text: #f0f0f5;
  --muted: #888899;
  --radius: 16px;
}
body {
  font-family: Inter, system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.card {
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.055);
}
.hero { width: 100%; height: 260px; object-fit: cover; display: block; }
.hero-placeholder {
  width: 100%; height: 260px;
  background: linear-gradient(135deg, #1c1c27 0%, #272738 100%);
  display: flex; align-items: center; justify-content: center;
}
.body { padding: 24px; }
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(212,175,55,.1); color: var(--gold);
  font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;
  border: 1px solid rgba(212,175,55,.18);
}
.badge-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); }
h1 { font-size: 22px; font-weight: 800; line-height: 1.25; margin-bottom: 8px; }
.location {
  font-size: 13px; color: var(--muted); margin-bottom: 14px;
  display: flex; align-items: center; gap: 5px;
}
.price { font-size: 30px; font-weight: 800; color: var(--gold); margin-bottom: 10px; letter-spacing: -.5px; }
.desc { font-size: 14px; color: var(--muted); line-height: 1.6; margin-bottom: 28px; }
.divider { height: 1px; background: rgba(255,255,255,.07); margin-bottom: 22px; }
.cta-label { font-size: 13px; color: var(--muted); text-align: center; margin-bottom: 14px; font-weight: 500; }
.btn-download {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; background: var(--gold); color: #000;
  font-size: 15px; font-weight: 700; padding: 15px;
  border-radius: 12px; text-decoration: none; margin-bottom: 10px;
  transition: background .2s, transform .12s;
}
.btn-download:hover { background: var(--gold-dark); transform: translateY(-1px); }
.btn-download:active { transform: translateY(0); }
.btn-download svg { flex-shrink: 0; }
.btn-web {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 11px; color: rgba(255,255,255,.18); text-decoration: none;
  padding: 10px; transition: color .2s; letter-spacing: .02em;
}
.btn-web:hover { color: rgba(255,255,255,.4); }
.brand { text-align: center; margin-top: 24px; font-size: 12px; color: rgba(255,255,255,.12); letter-spacing: .05em; }
.brand strong { color: var(--gold); opacity: .6; }
</style>

<!-- Attempt to open the native app silently before page renders -->
<script>
(function() {
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
    window.location.href = '${deepLink}';
  }
})();
</script>
</head>
<body>
<div class="card">
  ${hasHeroImage
    ? `<img class="hero" src="${imageUrl}" alt="${esc(title)}" loading="eager">`
    : `<div class="hero-placeholder">${ICON_HOME}</div>`}
  <div class="body">
    <div class="badge"><span class="badge-dot"></span>DHUB Rental</div>
    <h1>${esc(title)}</h1>
    ${city ? `<p class="location">${ICON_LOCATION} ${esc(city)}</p>` : ''}
    <p class="price">${esc(priceDisplay)}</p>
    <p class="desc">${esc(shortDesc)}</p>

    <div class="divider"></div>
    <p class="cta-label">View this listing on the DHUB app</p>

    <a class="btn-download" href="${PLAY_STORE_URL}" id="btn-android">
      ${ICON_ANDROID} Get on Android
    </a>
    <a class="btn-download" href="${APP_STORE_URL}" id="btn-ios">
      ${ICON_APPLE} Get on iPhone / iPad
    </a>
    <a class="btn-web" href="${webLink}" id="btn-web">
      ${ICON_GLOBE} continue on web
    </a>
  </div>
</div>
<p class="brand">Powered by <strong>DHUB</strong></p>

<script>
(function() {
  var ua = navigator.userAgent;
  var isIos = /iPhone|iPad|iPod/i.test(ua);
  var isAndroid = /Android/i.test(ua);
  var btnIos = document.getElementById('btn-ios');
  var btnAndroid = document.getElementById('btn-android');
  if (isIos && btnAndroid) btnAndroid.style.display = 'none';
  if (isAndroid && btnIos) btnIos.style.display = 'none';
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
});
