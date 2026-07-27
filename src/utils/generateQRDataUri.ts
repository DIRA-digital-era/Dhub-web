// src/utils/generateQRDataUri.ts
import QRCode from 'qrcode';

/**
 * Generates a QR code as a data URI (SVG or PNG) for embedding in PDFs.
 * Works on both web and native.
 */
export async function generateQRDataUri(
  value: string,
  size: number = 250,
  format: 'svg' | 'png' = 'png'
): Promise<string> {
  try {
    if (format === 'svg') {
      const svgString = await QRCode.toString(value, {
        type: 'svg',
        width: size,
        margin: 2,
        errorCorrectionLevel: 'H',
      });
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
    } else {
      // PNG data URI
      const pngBuffer = await QRCode.toDataURL(value, {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'H',
      });
      return pngBuffer;
    }
  } catch (error) {
    console.error('QR generation failed:', error);
    // Fallback to external API
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  }
}