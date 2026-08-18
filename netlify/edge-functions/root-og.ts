// netlify/edge-functions/root-og.ts

export default async () => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DHUB · Find Your Next Home</title>

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DHUB">
  <meta property="og:title" content="DHUB · Find Your Next Home">
  <meta property="og:description" content="The trusted housing platform for tenants and landlords in Cameroon. Search, book, and move in with confidence.">
  <meta property="og:image" content="https://dhubweb.diracmr.com/assets/images/icon.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="https://dhubweb.diracmr.com">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #f8f9fa;
      color: #1a1a1a;
      transition: background 0.3s, color 0.3s;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0a0f; color: #f0f0f5; }
    }
    .container {
      max-width: 480px;
      width: 100%;
      background: #ffffff;
      border-radius: 24px;
      padding: 48px 32px 40px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03);
      text-align: center;
      animation: fadeUp 0.8s ease forwards;
      transition: background 0.3s, box-shadow 0.3s;
    }
    @media (prefers-color-scheme: dark) {
      .container {
        background: #13131a;
        box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
      }
    }
    @keyframes fadeUp {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .logo {
      font-size: 48px;
      font-weight: 800;
      letter-spacing: -1px;
      color: #D4AF37;
      line-height: 1.1;
    }
    .logo span { color: #1a1a1a; }
    @media (prefers-color-scheme: dark) {
      .logo span { color: #f0f0f5; }
    }
    .tagline {
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #D4AF37;
      margin-top: 6px;
      opacity: 0.7;
    }
    .hero-icon {
      margin: 32px 0 24px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .hero-icon svg {
      width: 56px;
      height: 56px;
      stroke: #D4AF37;
      stroke-width: 1.5;
      fill: none;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 12px;
      color: #1a1a1a;
    }
    @media (prefers-color-scheme: dark) {
      h1 { color: #f0f0f5; }
    }
    .desc {
      font-size: 16px;
      line-height: 1.6;
      color: #6a6a7a;
      margin-bottom: 32px;
    }
    @media (prefers-color-scheme: dark) {
      .desc { color: #8a8a9a; }
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #D4AF37;
      color: #0a0a0f;
      font-weight: 700;
      font-size: 17px;
      padding: 16px 40px;
      border-radius: 14px;
      text-decoration: none;
      transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
      box-shadow: 0 8px 24px rgba(212, 175, 55, 0.25);
    }
    .btn:hover {
      background: #c49c2e;
      transform: scale(1.02);
      box-shadow: 0 12px 32px rgba(212, 175, 55, 0.35);
    }
    .btn:active { transform: scale(0.98); }
    .btn svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: #0a0a0f;
      stroke-width: 2.5;
    }
    .features {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
      margin-top: 32px;
    }
    .feature {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #4a4a5a;
      background: #f0f0f2;
      padding: 8px 16px;
      border-radius: 20px;
      border: 1px solid #e4e4e8;
    }
    @media (prefers-color-scheme: dark) {
      .feature {
        color: #8a8a9a;
        background: #1e1e28;
        border-color: #2a2a36;
      }
    }
    .feature svg {
      width: 16px;
      height: 16px;
      stroke: #D4AF37;
      stroke-width: 2;
      fill: none;
    }
    .footer {
      margin-top: 32px;
      font-size: 13px;
      color: #8a8a9a;
      border-top: 1px solid #e4e4e8;
      padding-top: 24px;
      transition: border-color 0.3s;
    }
    @media (prefers-color-scheme: dark) {
      .footer { border-color: #1e1e28; }
    }
    .footer a {
      color: #D4AF37;
      text-decoration: none;
    }
    @media (max-width: 480px) {
      .container { padding: 32px 20px 28px; }
      .logo { font-size: 36px; }
      h1 { font-size: 22px; }
      .btn { padding: 14px 28px; font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">DHUB<span>.</span></div>
    <div class="tagline">Housing platform</div>

    <div class="hero-icon">
      <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2" />
      </svg>
    </div>

    <h1>Find your next home</h1>
    <p class="desc">
      Discover verified rentals across Cameroon. Book directly with landlords, pay securely, and move in with confidence.
    </p>

    <a class="btn" href="/explore">
      <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
      Begin your search
    </a>

    <div class="features">
      <span class="feature">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Verified listings
      </span>
      <span class="feature">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="8" width="20" height="14" rx="2" ry="2" />
          <path d="M6 8V6a6 6 0 0112 0v2" />
        </svg>
        Secure payments
      </span>
      <span class="feature">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Real-time chat
      </span>
    </div>

    <div class="footer">
      &copy; 2026 DHUB · Built with <span style="color:#D4AF37;">&#9829;</span> by <a href="https://diracmr.com" target="_blank">DIRA</a>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800',
    },
  });
};