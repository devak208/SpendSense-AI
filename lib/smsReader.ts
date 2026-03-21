// SMS Reader Service
// Handles SMS permission and listening for incoming messages including Event Broadcasting

import { Platform, DeviceEventEmitter } from 'react-native';
import { parseBankSMS, ParsedTransaction, extractBankName } from './bankSmsParser';

// Type definitions for the library callback
type SMSCallback = (status: string, sms: string, error: string) => void;

// Event Name for transaction broadcasting
export const SMS_TRANSACTION_EVENT = 'sms_transaction_detected';
export const SMS_DEBUG_EVENT = 'sms_received_debug';

// Dynamic import for the SMS library (Android only)
let SmsModule: {
  checkIfHasSMSPermission: () => Promise<{
    hasReceiveSmsPermission: boolean;
    hasReadSmsPermission: boolean;
  }>;
  requestReadSMSPermission: () => Promise<boolean>;
  startReadSMS: (successCallback: SMSCallback, errorCallback: SMSCallback) => void;
} | null = null;

// Logging utility for SMS debugging
const SMS_LOG_TAG = '[SMSReader]';
function logSMS(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`${SMS_LOG_TAG} [${timestamp}] ${message}`, data);
  } else {
    console.log(`${SMS_LOG_TAG} [${timestamp}] ${message}`);
  }
}

// Store received SMS for debugging
const smsHistory: Array<{
  timestamp: Date;
  rawData: string;
  sender: string | null;
  body: string | null;
  parsed: boolean;
  transaction: ParsedTransaction | null;
}> = [];

/**
 * Get SMS history for debugging
 */
export function getSMSHistory() {
  return smsHistory;
}

/**
 * Clear SMS history
 */
export function clearSMSHistory() {
  smsHistory.length = 0;
}

// Try to import the SMS module (will fail gracefully on iOS or if not installed)
async function loadSmsModule() {
  if (Platform.OS !== 'android') {
    logSMS('SMS reading is only available on Android');
    return null;
  }

  try {
    // logSMS('Loading SMS module...');
    const module = await import('@maniac-tech/react-native-expo-read-sms');
    SmsModule = {
      checkIfHasSMSPermission: module.checkIfHasSMSPermission,
      requestReadSMSPermission: module.requestReadSMSPermission,
      startReadSMS: module.startReadSMS,
    };
    // logSMS('SMS module loaded successfully');
    return SmsModule;
  } catch (error) {
    logSMS('SMS module not available:', error);
    return null;
  }
}

// SMS Reader State
// Note: We no longer store callbacks, we use DeviceEventEmitter

/**
 * Check if SMS reading is supported on this device
 */
export function isSMSReadingSupported(): boolean {
  return Platform.OS === 'android';
}

/**
 * Check current SMS permission status
 */
export async function checkSMSPermission(): Promise<{
  hasReceiveSmsPermission: boolean;
  hasReadSmsPermission: boolean;
  isSupported: boolean;
}> {
  logSMS('Checking SMS permissions...');

  if (Platform.OS !== 'android') {
    return {
      hasReceiveSmsPermission: false,
      hasReadSmsPermission: false,
      isSupported: false,
    };
  }

  const module = await loadSmsModule();
  if (!module) {
    return {
      hasReceiveSmsPermission: false,
      hasReadSmsPermission: false,
      isSupported: false,
    };
  }

  try {
    const status = await module.checkIfHasSMSPermission();
    return {
      ...status,
      isSupported: true,
    };
  } catch (error) {
    logSMS('Error checking SMS permission:', error);
    return {
      hasReceiveSmsPermission: false,
      hasReadSmsPermission: false,
      isSupported: true,
    };
  }
}

/**
 * Request SMS reading permission
 */
export async function requestSMSPermission(): Promise<boolean> {
  logSMS('Requesting SMS permission...');

  if (Platform.OS !== 'android') {
    return false;
  }

  const module = await loadSmsModule();
  if (!module) {
    return false;
  }

  try {
    const granted = await module.requestReadSMSPermission();
    logSMS('Permission request result:', granted);
    return granted;
  } catch (error) {
    logSMS('Error requesting SMS permission:', error);
    return false;
  }
}

/**
 * Start listening for incoming SMS messages
 * Uses DeviceEventEmitter to broadcast: 
 * - SMS_TRANSACTION_EVENT for parsed transactions
 * - SMS_DEBUG_EVENT for raw data
 * 
 * This is effectively a singleton listener.
 */
// Singleton state
let isListening = false;
let startListenerPromise: Promise<boolean> | null = null;
let lastProcessedRawSms = '';
let lastProcessedTime = 0;

/**
 * Start listening for incoming SMS messages
 * Singleton Implementation: Ensures only one native listener is active
 */
export function startSMSListener(): Promise<boolean> {
  if (isListening) {
    logSMS('ℹ️ SMS listener already running (State)');
    return Promise.resolve(true);
  }

  if (startListenerPromise) {
    logSMS('ℹ️ SMS listener initialization already in progress...');
    return startListenerPromise;
  }

  startListenerPromise = (async () => {
    logSMS('====== STARTING SMS LISTENER (SINGLETON) ======');

    if (Platform.OS !== 'android') {
      logSMS('❌ SMS reading not supported on this platform');
      return false;
    }

    const module = await loadSmsModule();
    if (!module) {
      logSMS('❌ SMS module not available');
      return false;
    }

    const permissions = await checkSMSPermission();
    if (!permissions.hasReadSmsPermission || !permissions.hasReceiveSmsPermission) {
      logSMS('❌ SMS permissions not granted');
      return false;
    }

    try {
      logSMS('Calling native startReadSMS...');

      module.startReadSMS(
        (status: string, sms: string, error: string) => {
          if (status === 'success' && sms) {
            handleIncomingSMS(sms);
          }
        },
        (status: string, sms: string, error: string) => {
          // Error callback
          if (error && !error.includes('already running')) {
            logSMS('❌ SMS ERROR CALLBACK:', error);
          }
        }
      );

      isListening = true;
      logSMS('✅ SMS listener started successfully');
      return true;
    } catch (error) {
      logSMS('❌ Error starting SMS listener:', error);
      return false;
    } finally {
      startListenerPromise = null;
    }
  })();

  return startListenerPromise;
}

/**
 * Handle incoming SMS message
 */
function handleIncomingSMS(smsData: string) {
  // 1. Raw Deduplication (Low Level)
  // If we receive the exact same raw string within 5 seconds, ignore it.
  const now = Date.now();
  if (smsData === lastProcessedRawSms && (now - lastProcessedTime < 5000)) {
    logSMS('Ignoring duplicate RAW SMS event');
    return;
  }

  lastProcessedRawSms = smsData;
  lastProcessedTime = now;

  logSMS('====== INCOMING SMS ======');
  logSMS('Raw data length:', smsData.length);
  // ... rest of processing


  const historyEntry: typeof smsHistory[0] = {
    timestamp: new Date(),
    rawData: smsData,
    sender: null,
    body: null,
    parsed: false,
    transaction: null,
  };

  try {
    // Parsing logic for different Android SMS formats (Array string usually)
    let senderNumber: string | null = null;
    let messageBody: string | null = null;

    // Try format 1 & 2: [sender, body]
    const bracketMatch = smsData.match(/^\[([^\],]+),\s*(.+)\]$/s);
    if (bracketMatch) {
      senderNumber = bracketMatch[1].trim();
      messageBody = bracketMatch[2].trim();
      // Remove trailing bracket if present
      if (messageBody.endsWith(']')) {
        messageBody = messageBody.slice(0, -1);
      }
      logSMS('Parsed using bracket format');
    }

    // Try alternative: split by first comma
    if (!senderNumber || !messageBody) {
      const firstCommaIndex = smsData.indexOf(',');
      if (firstCommaIndex > 0) {
        senderNumber = smsData.substring(0, firstCommaIndex).replace(/[\[\]]/g, '').trim();
        messageBody = smsData.substring(firstCommaIndex + 1).replace(/[\[\]]/g, '').trim();
        logSMS('Parsed using comma split');
      }
    }

    if (!senderNumber || !messageBody) {
      logSMS('❌ Could not parse SMS data format');
      historyEntry.parsed = false;
      smsHistory.unshift(historyEntry);
      return;
    }

    historyEntry.sender = senderNumber;
    historyEntry.body = messageBody;

    // Emit debug event
    DeviceEventEmitter.emit(SMS_DEBUG_EVENT, { sender: senderNumber, body: messageBody, raw: smsData });

    // Check if it looks like a bank transaction before processing
    // Heuristic: Must have amount and some transaction keywords
    const isPotentialTransaction = /Rs\.?|INR|₹|debited|credited|spent|received|txn/i.test(messageBody);

    if (isPotentialTransaction) {
      processMessage(senderNumber, messageBody, historyEntry);
    } else {
      logSMS('ℹ️ Ignored non-transaction SMS');
      historyEntry.parsed = false;
      smsHistory.unshift(historyEntry);
    }

  } catch (error) {
    logSMS('❌ Error parsing SMS data:', error);
    historyEntry.parsed = false;
    smsHistory.unshift(historyEntry);
  }
}

/**
 * Process and parse bank message
 */
/**
 * Process and parse bank message
 */
async function processMessage(
  senderNumber: string,
  messageBody: string,
  historyEntry: typeof smsHistory[0]
) {
  logSMS('====== PROCESSING MESSAGE ======');

  let transaction: ParsedTransaction | null = null;

  // 1. Try Gemini API first (High Accuracy)
  try {
    logSMS('🤖 Asking Gemini to parse...');
    // We need the backend URL. For Expo dev, use local IP or tunnel. 
    // Assuming backend is reachable at relative path if proxied, 
    // or we need the full URL from env.
    // We need the backend URL.
    const API_URL = 'https://spend-sense-ai-backend.vercel.app';

    const response = await fetch(`${API_URL}/api/parse-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: senderNumber, message: messageBody })
    });

    const json = await response.json();

    if (json.success && json.data && json.data.isTransaction) {
      logSMS('✅ Gemini identified transaction!');
      const d = json.data;
      transaction = {
        type: d.type || 'debit',
        amount: d.amount || 0,
        bankName: d.bankName || extractBankName(senderNumber, messageBody), // Fallback to local name extraction
        accountLast4: d.accountLast4,
        merchant: d.merchant,
        balance: d.balance,
        rawMessage: messageBody,
        senderNumber: senderNumber,
        timestamp: new Date(),
      };
    } else {
      logSMS('🤖 Gemini said: Not a transaction or failed to parse details.');
    }
  } catch (apiError) {
    logSMS('⚠️ Gemini API failed, falling back to local regex:', apiError);
  }

  // 2. Fallback to Local Regex if Gemini failed or didn't return a transaction
  if (!transaction) {
    logSMS('Using local regex parser fallback...');
    transaction = parseBankSMS(senderNumber, messageBody);
  }

  historyEntry.parsed = !!transaction;
  historyEntry.transaction = transaction;
  smsHistory.unshift(historyEntry);

  if (smsHistory.length > 50) smsHistory.pop();

  if (transaction) {
    logSMS('✅ TRANSACTION DETECTED!');
    logSMS('  Bank:', transaction.bankName);
    logSMS('  Amount:', transaction.amount);

    // BROADCAST EVENT
    logSMS('🎙️ Broadcasting transaction event...');
    DeviceEventEmitter.emit(SMS_TRANSACTION_EVENT, transaction);
  } else {
    logSMS('ℹ️ Not a bank transaction SMS');
  }
}

/**
 * Test SMS parsing with a sample message (for debugging)
 */
export function testSMSParsing(senderNumber: string, messageBody: string): ParsedTransaction | null {
  logSMS('====== TEST SMS PARSING ======');
  const result = parseBankSMS(senderNumber, messageBody);
  if (result) {
    logSMS('✅ Parsing successful:', result);
    // Optionally emit for test? No, keep it pure.
  }
  return result;
}

/**
 * Stop SMS listener
 */
export function stopSMSListener() {
  logSMS('Stopping SMS listener...');
  isListening = false;
  // We can't actually stop the native listener in this lib easily without restarting app context usually
  // But we can stop emitting events if we added a check
}

/**
 * Check if currently listening
 */
export function isCurrentlyListening(): boolean {
  return isListening;
}
