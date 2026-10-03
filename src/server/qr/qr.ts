import QRCode from "qrcode";

/** Inline SVG for a QR code (student badges, receipts). `qrcode` 1.5 renders SVG strings. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
