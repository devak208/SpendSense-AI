// Notification Parser
// Parses payment notifications from UPI apps (GPay, PhonePe, Paytm, etc.)

import { ParsedTransaction } from './bankSmsParser';

// UPI App Package Names for testinge
export const UPI_APP_PACKAGES: { [key: string]: string } = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'in.amazon.mShop.android.shopping': 'Amazon Pay',
  'com.whatsapp': 'WhatsApp Pay',
  'in.org.npci.upiapp': 'BHIM',
  'com.mobikwik_new': 'Mobikwik',
  'com.freecharge.android': 'Freecharge',
  'com.csam.icici.bank.imobile': 'iMobile Pay',
  'com.sbi.upi': 'BHIM SBI Pay',
  'com.axis.mobile': 'Axis Mobile',
  'com.dream11.fantasy.navi': 'Navi',
  'io.navi.android': 'Navi',
  'com.cred.android': 'CRED',
  'club.cred.android': 'CRED',
  'com.slice': 'Slice',
  'in.slice': 'Slice',
  'com.myairtelapp': 'Airtel Thanks',
  'com.jio.myjio': 'JioUPI',
  'com.myjio.jiopay': 'JioPay',
};

// Patterns for extracting amount from notification text
const NOTIFICATION_AMOUNT_PATTERNS = [
  /(?:Rs\.?|₹|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,  // ₹500, Rs. 1,000.00
  /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs\.?|₹|INR)/i,   // 500 Rs
  /(?:paid|received|sent|got)\s+(?:Rs\.?|₹|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /₹\s*([0-9,]+)/,  // Simple ₹500 format
];

// Keywords indicating payment type
const PAID_KEYWORDS = ['paid', 'sent', 'debited', 'transferred', 'payment of'];
const RECEIVED_KEYWORDS = ['received', 'credited', 'got', 'cashback', 'refund'];

export interface NotificationData {
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

/**
 * Check if notification is from a UPI/payment app
 */
export function isPaymentAppNotification(packageName: string): boolean {
  return packageName in UPI_APP_PACKAGES;
}

/**
 * Get app name from package name
 */
export function getAppName(packageName: string): string {
  return UPI_APP_PACKAGES[packageName] || 'Unknown';
}

/**
 * Check if notification text contains payment information
 */
export function isPaymentNotification(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Must have amount
  const hasAmount = NOTIFICATION_AMOUNT_PATTERNS.some(p => p.test(text));
  if (!hasAmount) return false;
  
  // Must have payment keywords
  const hasPaymentKeyword = [
    ...PAID_KEYWORDS,
    ...RECEIVED_KEYWORDS,
    'upi', 'payment', 'transaction'
  ].some(kw => lowerText.includes(kw));
  
  // Exclude OTPs and promotional messages
  const isExcluded = /otp|verification|offer|discount|cashback.*offer|promo/i.test(text);
  
  return hasAmount && hasPaymentKeyword && !isExcluded;
}

/**
 * Extract amount from notification text
 */
export function extractNotificationAmount(text: string): number {
  for (const pattern of NOTIFICATION_AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        return amount;
      }
    }
  }
  return 0;
}

/**
 * Determine transaction type from notification
 */
export function getNotificationTransactionType(text: string): 'debit' | 'credit' | 'unknown' {
  const lowerText = text.toLowerCase();
  
  const hasPaid = PAID_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasReceived = RECEIVED_KEYWORDS.some(kw => lowerText.includes(kw));
  
  if (hasPaid && !hasReceived) return 'debit';
  if (hasReceived && !hasPaid) return 'credit';
  
  // If both or neither, check which comes first
  if (hasPaid && hasReceived) {
    const paidIndex = Math.min(...PAID_KEYWORDS.map(kw => {
      const idx = lowerText.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    const receivedIndex = Math.min(...RECEIVED_KEYWORDS.map(kw => {
      const idx = lowerText.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    return paidIndex < receivedIndex ? 'debit' : 'credit';
  }
  
  return 'unknown';
}

/**
 * Extract merchant/recipient from notification
 */
export function extractNotificationMerchant(text: string): string | null {
  // "Paid to Swiggy" or "Received from John"
  const toMatch = text.match(/(?:paid to|sent to|transferred to)\s+([A-Za-z0-9\s._-]+?)(?:\s*₹|\s*Rs|\.|$)/i);
  if (toMatch) return toMatch[1].trim();
  
  const fromMatch = text.match(/(?:received from|got from)\s+([A-Za-z0-9\s._-]+?)(?:\s*₹|\s*Rs|\.|$)/i);
  if (fromMatch) return fromMatch[1].trim();
  
  // UPI ID pattern
  const upiMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z]+)/);
  if (upiMatch) return upiMatch[1];
  
  return null;
}

/**
 * Parse notification into transaction format
 */
export function parsePaymentNotification(notification: NotificationData): ParsedTransaction | null {
  const { packageName, title, text, timestamp } = notification;
  
  // Combine title and text for parsing
  const fullText = `${title} ${text}`;
  
  console.log('[NotificationParser] Parsing:', packageName, fullText.substring(0, 100));
  
  // Check if it's from a payment app
  if (!isPaymentAppNotification(packageName)) {
    console.log('[NotificationParser] Not a payment app');
    return null;
  }
  
  // Check if notification contains payment info
  if (!isPaymentNotification(fullText)) {
    console.log('[NotificationParser] Not a payment notification');
    return null;
  }
  
  const amount = extractNotificationAmount(fullText);
  if (amount <= 0) {
    console.log('[NotificationParser] No valid amount');
    return null;
  }
  
  const type = getNotificationTransactionType(fullText);
  if (type === 'unknown') {
    console.log('[NotificationParser] Unknown transaction type');
    return null;
  }
  
  const result: ParsedTransaction = {
    type,
    amount,
    bankName: getAppName(packageName),
    accountLast4: null,
    merchant: extractNotificationMerchant(fullText),
    balance: null,
    rawMessage: fullText,
    senderNumber: packageName, // Use package name as sender for dedup
    timestamp: new Date(timestamp),
  };
  
  console.log('[NotificationParser] ✅ Parsed:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Generate dedup key for transaction (used for both SMS and notifications)
 * Uses amount + minute bucket to handle slight timing differences
 */
export function generateDedupKey(amount: number, timestamp: Date): string {
  const minuteBucket = Math.floor(timestamp.getTime() / 60000); // 60 second window
  return `${amount.toFixed(2)}-${minuteBucket}`;
}
