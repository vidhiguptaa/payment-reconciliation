export interface ExtractedData {
  amount: number | null;
  currency: string;
  transactionDate: string | null;
  transactionTime: string | null;
  referenceNumber: string | null;
  utrNumber: string | null;
  transactionId: string | null;
  senderName: string | null;
  receiverName: string | null;
  transactionType: string;
  paymentStatus: string;
  rawJson: string;
  confidence: number;
}

export class TransactionNormalizer {
  static normalizeAmount(val: any): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;

    let s = String(val).trim();
    if (!s) return null;

    // Remove prefix currency symbols and text (e.g. ₹, Rs., Rs, INR, $)
    s = s.replace(/^(?:[₹$]|Rs\.?|INR)\s*/gi, '').trim();
    // Remove commas
    s = s.replace(/,/g, '');

    // Extract first valid float pattern
    const match = s.match(/[-+]?\d+(?:\.\d+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  static normalizeDate(val: any): string | null {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;

    // Try ISO YYYY-MM-DD
    const isoMatch = s.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // Try DMY DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = s.match(/\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    }

    // Try parsing textual months (e.g. "26 Jul 2026", "July 26, 2026")
    try {
      const parsedDate = new Date(s);
      if (!isNaN(parsedDate.getTime())) {
        const yyyy = parsedDate.getFullYear();
        const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(parsedDate.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch {}

    return s;
  }

  static normalizeTime(val: any): string | null {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;

    const timeMatch = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\b/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const meridiem = timeMatch[4];

      if (meridiem) {
        const m = meridiem.toUpperCase();
        if (m === 'PM' && hours < 12) {
          hours += 12;
        } else if (m === 'AM' && hours === 12) {
          hours = 0;
        }
      }

      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    }

    return s;
  }

  static normalizeText(val: any): string | null {
    if (val === null || val === undefined) return null;
    const s = String(val).split('\n')[0].trim();
    return s || null;
  }

  static normalizeUppercase(val: any): string | null {
    if (val === null || val === undefined) return null;
    const s = String(val).trim().toUpperCase().replace(/\s+/g, '');
    return s || null;
  }
}

export class TransactionExtractor {
  static extract(rawText: string): ExtractedData {
    const data: ExtractedData = {
      amount: null,
      currency: 'INR',
      transactionDate: null,
      transactionTime: null,
      referenceNumber: null,
      utrNumber: null,
      transactionId: null,
      senderName: null,
      receiverName: null,
      transactionType: 'UPI',
      paymentStatus: 'SUCCESS',
      confidence: 0.60,
      rawJson: ''
    };

    if (!rawText) {
      data.rawJson = JSON.stringify(data);
      return data;
    }

    // 1. Amount Extraction
    // Pass A: Look for explicit currency prefix (₹, $, Rs., Rs, INR) followed by digits
    let amtMatch = rawText.match(/(?:[₹$]|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i);

    // Pass B: Look for labels like "amount", "total", "paid" followed by numbers
    if (!amtMatch) {
      amtMatch = rawText.match(/(?:amount|total|sum|paid|transfer|val)[:\s]*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i);
    }

    // Pass C: Standalone decimal amounts (e.g. 500.00, 1250.50)
    if (!amtMatch) {
      amtMatch = rawText.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/);
    }

    // Pass D: Fallback to standalone digit sequences, skipping common false positive years (2020-2029)
    if (!amtMatch) {
      const candidates = rawText.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?)\b/g);
      if (candidates) {
        for (const candidate of candidates) {
          const num = TransactionNormalizer.normalizeAmount(candidate);
          if (num !== null && num !== 2024 && num !== 2025 && num !== 2026 && num !== 2027 && num !== 2028) {
            data.amount = num;
            break;
          }
        }
      }
    } else {
      data.amount = TransactionNormalizer.normalizeAmount(amtMatch[1]);
    }

    // 2. Date Extraction
    // Look for formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or DD MMM YYYY
    const dateMatch = rawText.match(/\b(?:\d{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]\d{4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/i);
    if (dateMatch) {
      data.transactionDate = TransactionNormalizer.normalizeDate(dateMatch[0]);
    }

    // 3. Time Extraction
    // Look for formats like 14:30:00, 2:30 PM, etc.
    const timeMatch = rawText.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:AM|PM|am|pm)?\b/i);
    if (timeMatch) {
      data.transactionTime = TransactionNormalizer.normalizeTime(timeMatch[0]);
    }

    // 4. Reference Number / UTR Extraction
    // Pass A: Explicit prefix (Ref, UTR, Txn ID, etc.), allowing optional "No." or "Number" separator
    let refMatch = rawText.match(/(?:Ref|Reference|UPI\s*Ref|UTR|Txn\s*ID|Order\s*ID|RRN)(?:\s*(?:No\.?|Number))?[:\s#]*([A-Z0-9]{8,22})/i);

    // Pass B: Standalone 12-digit number (common for UPI Ref/UTR in India)
    if (!refMatch) {
      refMatch = rawText.match(/\b([0-9]{12})\b/);
    }

    if (refMatch) {
      const cleanedRef = TransactionNormalizer.normalizeUppercase(refMatch[1]);
      data.referenceNumber = cleanedRef;
      data.utrNumber = cleanedRef;
      data.transactionId = cleanedRef;
    }

    // 5. Payee Name / Receiver Name
    const payeeMatch = rawText.match(/(?:Paid\s*to|To|Beneficiary|Receiver)[:\s]*([A-Za-z0-9\s&.-]{3,50})/i);
    if (payeeMatch) {
      data.receiverName = TransactionNormalizer.normalizeText(payeeMatch[1]);
    }

    // 6. Bank IFSC
    const ifscMatch = rawText.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i);
    if (ifscMatch) {
      const cleanedIfsc = TransactionNormalizer.normalizeUppercase(ifscMatch[0]);
      // Store under sender/receiver bank context if details expand, or remarks
    }

    // 7. Status extraction
    if (/\b(failed|unsuccessful|declined)\b/i.test(rawText)) {
      data.paymentStatus = 'FAILED';
    } else if (/\b(pending|processing)\b/i.test(rawText)) {
      data.paymentStatus = 'PENDING';
    } else {
      data.paymentStatus = 'SUCCESS';
    }

    data.rawJson = JSON.stringify(data);
    return data;
  }
}
