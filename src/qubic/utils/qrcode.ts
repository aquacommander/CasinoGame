import QRCode from "qrcode";

/**
 * Generate QR code from string data
 * @param data - The data to encode in the QR code
 * @returns Promise<string> - Data URL of the QR code image
 */
export async function generateQRCode(data: string): Promise<string> {
  if (!data || data.trim() === "") {
    throw new Error("QR code data cannot be empty");
  }
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw error;
  }
}

