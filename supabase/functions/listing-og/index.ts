import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ── Constants ──────────────────────────────────────────────────────────────
const APP_STORE_URL = 'https://apps.apple.com/app/dhub/id000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.diracmr.dhub';
const WEB_BASE_URL = 'https://dhubweb.diracmr.com';
const SUPABASE_PROJECT_URL = 'https://lpdszzdmhzrowtppngjb.supabase.co';
const MEDIA_BASE_URL = 'https://listings.frunjimbong.workers.dev';
// ── Bump this string on every deploy to auto-bust CDN cache via ETag change ──
const DEPLOY_VERSION = '20260906-2';

// ── XSS-safe HTML escaping ────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Inline SVG icons ──────────────────────────────────────────────────────
const ICON_LOCATION = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`;

const ICON_ANDROID = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341 14.67 9.2l2.855-5.223a.5.5 0 0 0-.88-.48L13.82 8.66a8.28 8.28 0 0 0-3.64 0L7.355 3.497a.5.5 0 0 0-.88.48L9.33 9.2 6.477 15.34A3 3 0 0 0 6 17a6 6 0 0 0 12 0 3 3 0 0 0-.477-1.659zM9.5 19a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`;

const ICON_APPLE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.37 2.83zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

const ICON_GLOBE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

const ICON_HOME = `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="rgba(212,175,55,0.35)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;

// ── Helper: Error page with a "Go to DHUB" button ────────────────────────
function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} - DHUB</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #09090f;
  color: #f0f0f5;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.card {
  max-width: 480px;
  width: 100%;
  background: #13131a;
  border-radius: 16px;
  padding: 40px 32px;
  text-align: center;
  box-shadow: 0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.055);
}
h1 { font-size: 28px; font-weight: 800; margin-bottom: 12px; color: #D4AF37; }
p { font-size: 16px; color: #888899; line-height: 1.6; margin-bottom: 28px; }
.btn {
  display: inline-block;
  background: #D4AF37;
  color: #000;
  font-weight: 700;
  padding: 14px 32px;
  border-radius: 12px;
  text-decoration: none;
  font-size: 16px;
  transition: background 0.2s;
}
.btn:hover { background: #b8962e; }
</style>
</head>
<body>
<div class="card">
  <h1>${esc(title)}</h1>
  <p>${esc(message)}</p>
  <a class="btn" href="${WEB_BASE_URL}">Go to DHUB</a>
</div>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const url = new URL(req.url);
    const listingId = url.searchParams.get('id');
    if (!listingId) {
      const html = errorPage('Missing Listing ID', 'The link you followed is incomplete. Please visit our homepage.');
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      const html = errorPage('Configuration Error', 'We’re having trouble loading the listing. Please try again later.');
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: listing, error } = await supabase
      .from('listings')
      .select('title, price, city, media, description, price_unit')
      .eq('id', listingId)
      .single();

    if (error || !listing) {
      console.error(`Listing not found: ${listingId}`, error);
      const html = errorPage('Listing Not Found', 'The listing you’re looking for may have been removed or doesn’t exist.');
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 404,
      });
    }

    // ── Extract image URL ────────────────────────────────────────────────
    let imageUrl = '';
    if (listing.media && Array.isArray(listing.media)) {
      const firstImage = listing.media.find((m: any) => m.type === 'image');
      if (firstImage) {
        const imgUrl = firstImage.thumbUrl || firstImage.url;
        imageUrl = imgUrl?.startsWith('/media/') ? MEDIA_BASE_URL + imgUrl : imgUrl || '';
      }
    }
    if (!imageUrl) imageUrl = WEB_BASE_URL + '/icon.png';

    // ── Build display fields ─────────────────────────────────────────────
    const title = listing.title || 'DHUB Listing';
    const priceUnit = listing.price_unit === 'per_night' ? 'night' : 'month';
    const priceDisplay = listing.price
      ? listing.price.toLocaleString('en-US') + ' FCFA/' + priceUnit
      : 'Price on request';
    const city = listing.city || '';
    const ogDescription = city ? city + ' \u2022 ' + priceDisplay : priceDisplay;
    const shortDesc = listing.description
      ? listing.description.substring(0, 180) + '...'
      : 'Find your perfect home on DHUB.';

    const deepLink = 'dhub://listing/' + listingId;
    const webLink = WEB_BASE_URL + '/app/listing/' + listingId;
    const canonicalUrl = SUPABASE_PROJECT_URL + '/functions/v1/listing-og?id=' + listingId;

    const hasHeroImage = imageUrl && imageUrl !== WEB_BASE_URL + '/icon.png';

    // ── Build gallery HTML separately (avoids nested template literals) ──
    let galleryHtml = '';
    if (listing.media && listing.media.length > 0) {
      const slides = listing.media.map((m: any) => {
        const url = (m.type === 'video' ? m.thumbUrl : m.url) || '';
        const src = url.startsWith('/media/') ? MEDIA_BASE_URL + url : url;
        return `<div class="gallery-slide"><img src="${src}" alt="${esc(title)}" loading="lazy"></div>`;
      }).join('');

      const dots = listing.media.map((_: any, i: number) =>
        `<div class="gallery-dot${i === 0 ? ' active' : ''}"></div>`
      ).join('');

      let arrows = '';
      if (listing.media.length > 1) {
        arrows = `
          <button class="gallery-arrow gallery-arrow-left hidden" id="arrow-prev">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button class="gallery-arrow gallery-arrow-right" id="arrow-next">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <div class="gallery-dots">${dots}</div>
        `;
      }

      galleryHtml = `
        <div class="gallery-container" id="gallery">
          <div class="gallery-track" id="gallery-track">
            ${slides}
          </div>
          ${arrows}
        </div>
      `;
    } else {
      galleryHtml = `<div class="hero-placeholder">${ICON_HOME}</div>`;
    }

    // ── Build final HTML ──────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-deploy-version" content="${DEPLOY_VERSION}">
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

/* ── Gallery Styles ── */
.gallery-container {
  position: relative;
  width: 100%;
  height: 260px;
  overflow: hidden;
  background: #1c1c27;
}
.gallery-track {
  display: flex;
  height: 100%;
  transition: transform 0.3s ease-in-out;
  touch-action: pan-y; /* Allow vertical scroll, hijack horizontal swipe */
}
.gallery-slide {
  min-width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.gallery-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gallery-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0,0,0,0.5);
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  opacity: 0.8;
  transition: opacity 0.2s;
}
.gallery-arrow:hover { opacity: 1; }
.gallery-arrow.hidden { display: none; }
.gallery-arrow-left { left: 10px; }
.gallery-arrow-right { right: 10px; }
.gallery-dots {
  position: absolute;
  bottom: 12px;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 6px;
  z-index: 10;
}
.gallery-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
  transition: background 0.2s, transform 0.2s;
}
.gallery-dot.active {
  background: var(--gold);
  transform: scale(1.3);
}

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

</head>
<body>
<div class="card">
  ${galleryHtml}
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
  var isMobile = isIos || isAndroid;
  var btnIos = document.getElementById('btn-ios');
  var btnAndroid = document.getElementById('btn-android');
  var btnWeb = document.getElementById('btn-web');

  // Hide irrelevant store button based on OS
  if (isIos && btnAndroid) btnAndroid.style.display = 'none';
  if (isAndroid && btnIos) btnIos.style.display = 'none';

  // ── Gallery Logic ────────────────────────────────────────────────────────
  var track = document.getElementById('gallery-track');
  if (track) {
    var slides = track.querySelectorAll('.gallery-slide');
    var dots = document.querySelectorAll('.gallery-dot');
    var prevBtn = document.getElementById('arrow-prev');
    var nextBtn = document.getElementById('arrow-next');
    var totalSlides = slides.length;
    var currentIndex = 0;

    function updateGallery() {
      track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
      dots.forEach(function(dot, i) {
        dot.className = i === currentIndex ? 'gallery-dot active' : 'gallery-dot';
      });
      if (prevBtn) prevBtn.className = currentIndex === 0 ? 'gallery-arrow gallery-arrow-left hidden' : 'gallery-arrow gallery-arrow-left';
      if (nextBtn) nextBtn.className = currentIndex === totalSlides - 1 ? 'gallery-arrow gallery-arrow-right hidden' : 'gallery-arrow gallery-arrow-right';
    }

    if (prevBtn) prevBtn.addEventListener('click', function() {
      if (currentIndex > 0) { currentIndex--; updateGallery(); }
    });
    if (nextBtn) nextBtn.addEventListener('click', function() {
      if (currentIndex < totalSlides - 1) { currentIndex++; updateGallery(); }
    });

    // Touch support for swiping
    var startX = 0, currentX = 0, isDragging = false;
    track.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      isDragging = true;
      track.style.transition = 'none';
    }, {passive: true});

    track.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
      var diff = startX - currentX;
      track.style.transform = 'translateX(calc(-' + (currentIndex * 100) + '% - ' + diff + 'px))';
    }, {passive: true});

    track.addEventListener('touchend', function(e) {
      if (!isDragging) return;
      isDragging = false;
      track.style.transition = 'transform 0.3s ease-in-out';
      var diff = startX - currentX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentIndex < totalSlides - 1) currentIndex++;
        else if (diff < 0 && currentIndex > 0) currentIndex--;
      }
      updateGallery();
    });
  }

  // On desktop show both store buttons prominently and skip deep link
  if (!isMobile) return;

  // ── Smart deep-link with fallback ──────────────────────────────────────
  window.addEventListener('load', function() {
    setTimeout(function() {
      var appOpened = false;
      function onBlur() {
        appOpened = true;
      }
      window.addEventListener('blur', onBlur);
      document.addEventListener('pagehide', function() { appOpened = true; });

      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = '${deepLink}';
      document.body.appendChild(iframe);

      setTimeout(function() {
        window.removeEventListener('blur', onBlur);
        document.body.removeChild(iframe);
      }, 2000);
    }, 300);
  });
})();
</script>
</body>
</html>`;

    // ── Return with explicit headers ─────────────────────────────────────
    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

    return new Response(html, { headers, status: 200 });

  } catch (err) {
    console.error('Edge function error:', err);
    const html = errorPage('Internal Server Error', 'Something went wrong. Please try again later.');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 500,
    });
  }
});