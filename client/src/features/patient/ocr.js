/**
 * Reads a payment receipt screenshot in the browser (Tesseract.js) to pre-fill the reference number and check
 * the amount. The image never leaves the device for OCR. The result is only a hint: the doctor still confirms
 * the payment in their own e-wallet or bank app.
 */

const REF_PATTERNS = [
  // GCash "Ref No. 1234 567 890123", Maya "Reference ID 1A2B3C4D", banks "Reference Number: ..."
  /ref(?:erence)?\.?\s*(?:no|number|id|#)?\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{5,38}[A-Z0-9])/i,
  /transaction\s*(?:no|number|id)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{5,38}[A-Z0-9])/i,
];

const AMOUNT_PATTERN = /(?:PHP|₱|P)\s?([\d,]{1,9}\.\d{2})/gi;
// OCR often drops the "₱" glyph; fall back to plain amounts like "300.00" or "1,250.00"
const BARE_AMOUNT_PATTERN = /(?:^|\s)(\d{1,3}(?:,\d{3})*\.\d{2})(?=\s|$)/gm;

function cleanReference(raw) {
  if (!raw) return '';
  // OCR often reads the line break after the number as more digits; keep the first run of 6–40 characters
  const one = raw.split(/\s{2,}|\n/)[0].trim();
  return one.replace(/[^A-Za-z0-9 -]/g, '').slice(0, 40).trim();
}

export function parseReceipt(text, expectedAmount) {
  let reference = '';
  for (const re of REF_PATTERNS) {
    const m = text.match(re);
    if (m) { reference = cleanReference(m[1]); break; }
  }

  const toNumbers = (re) => [...text.matchAll(re)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => n > 0);
  let amounts = toNumbers(AMOUNT_PATTERN);
  if (!amounts.length) amounts = toNumbers(BARE_AMOUNT_PATTERN);
  const expected = Number(expectedAmount);
  let amount = null;
  if (amounts.length) amount = amounts.find((n) => Math.abs(n - expected) < 0.005) ?? Math.max(...amounts);

  return {
    reference: reference.replace(/[^A-Za-z0-9]/g, '').length >= 6 ? reference : '',
    amount,
    amountMatches: amount != null && Math.abs(amount - expected) < 0.005,
  };
}

export async function readReceipt(file, expectedAmount) {
  const { default: Tesseract } = await import('tesseract.js');
  const { data } = await Tesseract.recognize(file, 'eng');
  return parseReceipt(data?.text ?? '', expectedAmount);
}
