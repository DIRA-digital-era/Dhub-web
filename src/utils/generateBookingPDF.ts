// src/utils/generateBookingPDF.ts
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { generateQRDataUri } from './generateQRDataUri';

// Cache the logo base64 to avoid repeated file reads
let logoBase64Cache: string | null = null;

async function getLogoBase64(): Promise<string> {
  if (logoBase64Cache) return logoBase64Cache;

  try {
    const asset = Asset.fromModule(require('../components/dhub_logo_no_bg.png'));
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          logoBase64Cache = base64;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      logoBase64Cache = base64;
      return base64;
    }
  } catch (error) {
    console.warn('[generateBookingPDF] Failed to load logo:', error);
    return '';
  }
}

/**
 * Generate a printable HTML string for the booking agreement PDF.
 */
export async function generateBookingPDFHTML(params: {
  listing: any;
  user: any;
  startDate: Date;
  endDate: Date;
  totals: { rentAmount: number; cautionFee: number; total: number; durationType: string };
  agreementId?: string | null;
  agreementHash?: string | null;
  signedAt?: string | null;
  signatureText?: string;
}): Promise<string> {
  const { listing, user, startDate, endDate, totals, agreementId, agreementHash, signedAt, signatureText } = params;

  const escapeHtml = (value: string | null | undefined) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const logoBase64 = await getLogoBase64();
  const logoDataUri = logoBase64 ? `data:image/png;base64,${logoBase64}` : '';

  // ─── FULL CONTRACT TEXT (landlord's terms) ──────────────────────────────
  const landlordTerms = listing.terms_text || 'No specific terms provided. Standard rental agreement applies.';
  const contractText = `
${landlordTerms}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This Booking Agreement is entered into between ${user?.fullName || 'Student'} and ${listing.landlord?.full_name || 'Landlord'} for the property "${listing.title}".

Rent charge: ${totals.rentAmount.toLocaleString()} FCFA.
Caution (escrow): ${totals.cautionFee.toLocaleString()} FCFA.

The caution fee is held securely by DHUB in escrow to protect the property and will be released subject to the property's condition at checkout.

This agreement is pending until payment is completed through DHUB. Once payment is completed and the booking is activated, this agreement becomes enforceable.

Booking period: from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}.

By electronically signing below, the tenant confirms they have read and accepted these terms.
  `.trim();

  // ─── Agreement details block ────────────────────────────────────────────
  const agreementDetailsHtml = agreementId ? `
    <div style="margin:20px 0;padding:16px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;">
      <p><strong>Agreement ID:</strong> ${escapeHtml(agreementId)}</p>
      <p><strong>Signed At:</strong> ${escapeHtml(signedAt ? new Date(signedAt).toLocaleString() : '')}</p>
      <p><strong>Signed By:</strong> ${escapeHtml(user?.fullName || 'Student')}</p>
      ${agreementHash ? `<p><strong>Agreement Hash:</strong> ${escapeHtml(agreementHash)}</p>` : ''}
    </div>
  ` : '';

  // ─── QR Code – generate a data URI (PNG) ──────────────────────────────
  const qrPayload = `DHUB-CONTRACT:${agreementId || 'UNSIGNED'}`;
  const qrDataUri = await generateQRDataUri(qrPayload, 250);

  // ─── Full HTML ──────────────────────────────────────────────────────────
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DHUB Tenant Booking Agreement</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #1a1a1a;
      background: #fff;
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #D4AF37;
      margin-bottom: 30px;
    }
    .logo {
      max-width: 150px;
      margin-bottom: 10px;
    }
    .brand {
      color: #D4AF37;
      font-size: 28px;
      font-weight: bold;
      letter-spacing: 2px;
    }
    .subtitle {
      font-size: 14px;
      color: #666;
      margin-top: 4px;
    }
    .section {
      margin: 25px 0;
    }
    .section h2 {
      color: #D4AF37;
      font-size: 18px;
      border-bottom: 1px solid #eee;
      padding-bottom: 8px;
    }
    .details {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin: 12px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #eee;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      font-weight: 600;
      color: #555;
    }
    .detail-value {
      font-weight: 500;
    }
    .total {
      background: #fef3c7;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
    }
    .total .amount {
      font-size: 22px;
      font-weight: bold;
      color: #D4AF37;
    }
    .contract-text {
      margin: 16px 0;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
      white-space: pre-wrap;
      font-size: 14px;
      line-height: 1.8;
      border-left: 4px solid #D4AF37;
    }
    .qr {
      text-align: center;
      margin: 20px 0;
    }
    .qr img {
      width: 160px;
      height: 160px;
      border: 8px solid #fff;
      padding: 4px;
      border-radius: 8px;
      background: #fff;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoBase64 ? `<img class="logo" src="${logoDataUri}" alt="DHUB Logo" />` : ''}
    <div class="brand">DHUB</div>
    <div class="subtitle">Tenant Booking Agreement</div>
  </div>

  <div class="section">
    <h2>${escapeHtml(listing.title)}</h2>
    <div class="details">
      <div class="detail-row"><span class="detail-label">Location:</span><span class="detail-value">${escapeHtml(listing.city)}</span></div>
      <div class="detail-row"><span class="detail-label">Landlord:</span><span class="detail-value">${escapeHtml(listing.landlord?.full_name || 'N/A')}</span></div>
      <div class="detail-row"><span class="detail-label">Tenant:</span><span class="detail-value">${escapeHtml(user?.fullName || 'N/A')}</span></div>
      <div class="detail-row"><span class="detail-label">Move‑in:</span><span class="detail-value">${escapeHtml(startDate.toLocaleDateString())}</span></div>
      <div class="detail-row"><span class="detail-label">Move‑out:</span><span class="detail-value">${escapeHtml(endDate.toLocaleDateString())}</span></div>
      <div class="detail-row"><span class="detail-label">Duration:</span><span class="detail-value">${escapeHtml(totals.durationType)}</span></div>
    </div>
    <div class="total">
      <div><strong>Total Amount:</strong> <span class="amount">${escapeHtml(totals.total.toLocaleString())} FCFA</span></div>
      <div style="font-size:14px; margin-top:4px;">
        Rent: ${escapeHtml(totals.rentAmount.toLocaleString())} FCFA &nbsp;|&nbsp; Caution (Escrow): ${escapeHtml(totals.cautionFee.toLocaleString())} FCFA
      </div>
    </div>

    <h2>Terms & Conditions</h2>
    <div class="contract-text">${escapeHtml(contractText)}</div>

    ${agreementDetailsHtml}

    <div class="qr">
      <img src="${escapeHtml(qrDataUri)}" alt="QR Code" />
      <p style="font-size:12px;">Scan to verify agreement</p>
    </div>
  </div>

  <div class="footer">
    <p>DHUB • AWICUL Building Commercial Avenue Bda • +237 6 82 36 64 72 • info@diracmr.com</p>
    <p>Generated on ${escapeHtml(new Date().toLocaleDateString())}</p>
  </div>
</body>
</html>
  `;
}