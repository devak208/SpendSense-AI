// Bank SMS Parser Utility
// Parses Indian bank SMS messages to extract transaction details

export interface ParsedTransaction {
  type: 'debit' | 'credit' | 'owed' | 'receivable' | 'unknown';
  amount: number;
  bankName: string | null;
  accountLast4: string | null;
  merchant: string | null;
  balance: number | null;
  rawMessage: string;
  senderNumber: string;
  timestamp: Date;
  isSplitRequest?: boolean;
}

// Common Indian bank sender IDs
const BANK_SENDER_PATTERNS = [
  /HDFC/i
];

// Keywords indicating transaction type
const DEBIT_KEYWORDS = [
  'debited', 'debit', 'withdrawn', 'paid', 'spent', 'purchase', 
  'transferred', 'sent', 'payment', 'deducted', 'dr', 'withdrawn'
];

const CREDIT_KEYWORDS = [
  'credited', 'credit', 'received', 'deposited', 'refund', 
  'cashback', 'added', 'reversed', 'cr'
];

// Regex patterns for amount extraction
const AMOUNT_PATTERNS = [
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,         // Rs. 1,000.00 or Rs 1000
  /(?:Rs\.?|INR|₹)([\d,]+(?:\.\d{1,2})?)/i,             // Rs.1000.00 (no space)
  /(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)/i,  // 1000 Rs
  /(?:amount|amt)[\s:]+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, // Amount: Rs 1000
  /(?:of|for)\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, // of Rs 1000
];

// Account number patterns
const ACCOUNT_PATTERNS = [
  /(?:a\/c|ac|acct|account)[\s.:#]*(?:no\.?)?[\s:#]*[xX*]+(\d{4})/i,  // A/c XX1234
  /A\/c[xX]+(\d{4})/i,                                                 // A/cXX1234 (no space - BOI format)
  /(?:a\/c|ac|acct|account)[\s.:#]*(\d{4})$/i,                        // A/c 1234
  /[xX*]+(\d{4})/i,                                                    // XX1234
];

// Balance patterns
const BALANCE_PATTERNS = [
  /(?:bal|balance|avl\.?\s*bal)[\s.:]+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:available|avbl)[\s.:]+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
];

/**
 * Check if SMS is from a bank
 */
const GENERIC_SENDER_PATTERN = /^[A-Z]{2}-[A-Z0-9]{6}$/i;
const GENERIC_HEADER_PATTERN = /^[A-Z]{2,9}$/i; // Fallback for numeric/short headers

/**
 * Check if SMS is from a bank
 */
export function isBankSMS(senderNumber: string, messageBody: string): boolean {
  console.log('[BankSMS] ====== Checking SMS ======');
  console.log('[BankSMS] Sender:', senderNumber);
  console.log('[BankSMS] Message:', messageBody.substring(0, 100) + '...');
  
  // Check if sender matches known bank patterns OR generic format
  const senderMatchesKnown = BANK_SENDER_PATTERNS.some(pattern => pattern.test(senderNumber));
  // Generic check: Must look like a service sender (XX-AAAAAA)
  const senderMatchesGeneric = GENERIC_SENDER_PATTERN.test(senderNumber) || GENERIC_HEADER_PATTERN.test(senderNumber);
  
  console.log('[BankSMS] Sender matches known bank pattern:', senderMatchesKnown);
  console.log('[BankSMS] Sender matches generic pattern:', senderMatchesGeneric);
  
  // Also check if message body ends with bank identifier (like "-BOI")
  const messageEndsWithBank = /-[A-Z]{2,10}$/i.test(messageBody.trim());
  
  // Check if message contains transaction keywords
  const hasTransactionKeyword = [
    ...DEBIT_KEYWORDS,
    ...CREDIT_KEYWORDS,
    'transaction', 'txn', 'upi', 'neft', 'imps', 'rtgs', 'ac', 'a/c'
  ].some(keyword => messageBody.toLowerCase().includes(keyword));
  console.log('[BankSMS] Has transaction keyword:', hasTransactionKeyword);
  
  // Exclude OTP messages (Strict exclusion)
  const isOTP = /\botp\b|one.?time.?password|verification.?code|auth.?code/i.test(messageBody);
  if (isOTP) {
    console.log('[BankSMS] Excluded: OTP message');
    return false;
  }
  
  // Check for amount pattern
  const hasAmount = AMOUNT_PATTERNS.some(pattern => pattern.test(messageBody));
  console.log('[BankSMS] Has amount pattern:', hasAmount);
  
  // Logic:
  // 1. MUST have Amount.
  // 2. MUST have Transaction Keywords.
  // 3. MUST have (Known Sender OR (Generic Sender AND Bank Signature in Body) OR (Generic Sender AND Strong Keywords))
  
  // If explicitly known bank sender, we are looser on keywords
  if (senderMatchesKnown && hasAmount) return true;

  // If generic sender, we need strong signals
  if ((senderMatchesGeneric || messageEndsWithBank) && hasAmount && hasTransactionKeyword) {
     return true;
  }
  
  console.log('[BankSMS] Is bank SMS: false (Strict Check)');
  return false;
}

/**
 * Determine transaction type from message
 */
export function getTransactionType(message: string): 'debit' | 'credit' | 'unknown' {
  const lowerMessage = message.toLowerCase();
  
  const hasDebit = DEBIT_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const hasCredit = CREDIT_KEYWORDS.some(kw => lowerMessage.includes(kw));
  
  console.log('[BankSMS] Transaction type check - hasDebit:', hasDebit, 'hasCredit:', hasCredit);
  
  // Some messages have both keywords - use context
  // For BOI format: "debited A/c... and credited to..." - the first keyword indicates the action on YOUR account
  if (hasDebit && hasCredit) {
    // Check proximity and context
    const debitIndex = Math.min(...DEBIT_KEYWORDS.map(kw => {
      const idx = lowerMessage.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    const creditIndex = Math.min(...CREDIT_KEYWORDS.map(kw => {
      const idx = lowerMessage.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    
    console.log('[BankSMS] Both keywords found - debitIndex:', debitIndex, 'creditIndex:', creditIndex);
    
    // The first keyword is the action on YOUR account
    const result = debitIndex < creditIndex ? 'debit' : 'credit';
    console.log('[BankSMS] Determined type:', result);
    return result;
  }
  
  if (hasDebit) {
    console.log('[BankSMS] Type: debit');
    return 'debit';
  }
  if (hasCredit) {
    console.log('[BankSMS] Type: credit');
    return 'credit';
  }
  console.log('[BankSMS] Type: unknown');
  return 'unknown';
}

/**
 * Extract amount from message
 */
export function extractAmount(message: string): number {
  console.log('[BankSMS] Extracting amount from:', message.substring(0, 50));
  
  for (let i = 0; i < AMOUNT_PATTERNS.length; i++) {
    const pattern = AMOUNT_PATTERNS[i];
    const match = message.match(pattern);
    if (match && match[1]) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        console.log('[BankSMS] Amount found:', amount, 'using pattern', i);
        return amount;
      }
    }
  }
  console.log('[BankSMS] No amount found!');
  return 0;
}

/**
 * Extract account last 4 digits
 */
export function extractAccountNumber(message: string): string | null {
  for (const pattern of ACCOUNT_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract available balance
 */
export function extractBalance(message: string): number | null {
  for (const pattern of BALANCE_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const balanceStr = match[1].replace(/,/g, '');
      const balance = parseFloat(balanceStr);
      if (!isNaN(balance)) {
        return balance;
      }
    }
  }
  return null;
}

/**
 * Extract UPI merchant/recipient from message
 */
export function extractMerchant(message: string): string | null {
  // UPI ID patterns: something@okaxis, something@ybl, etc.
  const upiMatch = message.match(/(?:to|from)\s+([a-zA-Z0-9._-]+@[a-zA-Z]+)/i);
  if (upiMatch) {
    console.log('[BankSMS] UPI merchant found:', upiMatch[1]);
    return upiMatch[1];
  }
  return null;
}

/**
 * Extract bank name from sender or message
 */
export function extractBankName(senderNumber: string, messageBody?: string): string | null {
  const bankMappings: { [key: string]: string } = {
    'HDFC': 'HDFC Bank',
    'ICICI': 'ICICI Bank',
    'SBI': 'State Bank of India',
    'AXIS': 'Axis Bank',
    'KOTAK': 'Kotak Mahindra Bank',
    'PNB': 'Punjab National Bank',
    'BOB': 'Bank of Baroda',
    'BOI': 'Bank of India',
    'IOB': 'Indian Overseas Bank',
    'CANARA': 'Canara Bank',
    'UNION': 'Union Bank',
    'IDBI': 'IDBI Bank',
    'INDUS': 'IndusInd Bank',
    'YES': 'Yes Bank',
    'RBL': 'RBL Bank',
    'FEDERAL': 'Federal Bank',
    'BANDHAN': 'Bandhan Bank',
    'PAYTM': 'Paytm Payments Bank',
    'PHONEPE': 'PhonePe',
    'GPAY': 'Google Pay',
    'AMAZONPAY': 'Amazon Pay',
    'CITI': 'Citibank',
    'HSBC': 'HSBC',
    'SCB': 'Standard Chartered',
    'JUPITER': 'Jupiter',
    'FI': 'Fi Money',
    'NIYO': 'Niyo'
  };
  
  const upperSender = senderNumber.toUpperCase();
  
  // 1. Check strict mappings
  for (const [key, name] of Object.entries(bankMappings)) {
    if (upperSender.includes(key)) {
      console.log('[BankSMS] Bank from sender (Mapping):', name);
      return name;
    }
  }
  
  // 2. Check message signature (e.g. "-BOI")
  if (messageBody) {
    const bankSignature = messageBody.match(/-([A-Z]{2,10})\s*$/i);
    if (bankSignature) {
      const bankCode = bankSignature[1].toUpperCase();
      // Check mapping first
      if (bankMappings[bankCode]) {
        console.log('[BankSMS] Bank from signature (Mapping):', bankMappings[bankCode]);
        return bankMappings[bankCode];
      }
      // Heuristic: If generic signature (e.g. "-MyBank"), use it
      if (bankCode.length > 2) {
         console.log('[BankSMS] Bank from signature (Generic):', bankCode);
         return bankCode;
      }
    }
  }

  // 3. Fallback: Parse Sender ID Header (e.g. JM-HDFCBK -> HDFC)
  // Standard format: XX-HEADER
  const parts = upperSender.split('-');
  if (parts.length === 2 && parts[1].length >= 3) {
    let header = parts[1];
    // Remove common suffixes
    header = header.replace(/BK$/, '');
    header = header.replace(/BNK$/, '');
    header = header.replace(/BANK$/, '');
    header = header.replace(/IND$/, ''); // e.g. BOIIND
    
    // Check mapping again with stripped header
    for (const [key, name] of Object.entries(bankMappings)) {
        if (header.includes(key)) return name;
    }

    // Return generic (e.g. "ABC" from "XX-ABCBK")
    console.log('[BankSMS] Bank inferred from header:', header);
    return header;
  }
  
  console.log('[BankSMS] Bank not identified');
  return null;
}

/**
 * Parse complete bank SMS message
 */
export function parseBankSMS(
  senderNumber: string, 
  messageBody: string
): ParsedTransaction | null {
  console.log('[BankSMS] ====== PARSING SMS ======');
  console.log('[BankSMS] From:', senderNumber);
  console.log('[BankSMS] Body:', messageBody);
  
  // First check if it's a valid bank SMS
  if (!isBankSMS(senderNumber, messageBody)) {
    console.log('[BankSMS] ❌ Not a valid bank SMS');
    return null;
  }
  
  const amount = extractAmount(messageBody);
  if (amount <= 0) {
    console.log('[BankSMS] ❌ No valid amount found');
    return null;
  }
  
  const type = getTransactionType(messageBody);
  if (type === 'unknown') {
    console.log('[BankSMS] ❌ Unknown transaction type');
    return null;
  }
  
  const result = {
    type,
    amount,
    bankName: extractBankName(senderNumber, messageBody),
    accountLast4: extractAccountNumber(messageBody),
    merchant: extractMerchant(messageBody),
    balance: extractBalance(messageBody),
    rawMessage: messageBody,
    senderNumber,
    timestamp: new Date(),
  };
  
  console.log('[BankSMS] ✅ Parsed transaction:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Format amount for display
 */
export function formatTransactionAmount(amount: number, type: 'debit' | 'credit'): string {
  const formatted = amount.toLocaleString('en-IN', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 2 
  });
  return type === 'credit' ? `+₹${formatted}` : `-₹${formatted}`;
}
