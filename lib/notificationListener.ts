import RNAndroidNotificationListener, { RNAndroidNotificationListenerHeadlessJsName } from 'react-native-android-notification-listener';
import { AppRegistry, Platform } from 'react-native';
import { isDuplicateTransaction } from './deduplicator';
import { createExpense, createDebt, API_URL } from './supabase';

const ALLOWED_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user', // GPay
  'com.phonepe.app', // PhonePe
  'net.one97.paytm', // Paytm
  // We can add more specific apps here, or rely on the LLM to filter.
  // We will keep this list to avoid spamming the LLM with WhatsApp messages.
  'com.sbi.upi', // SBI Pay
  'com.csam.icici.bank.imobile', // iMobile Pay
  'com.hdfcbank.payzapp',
];

import { addTransactionToQueue } from './transactionQueue';
import { ParsedTransaction } from './bankSmsParser';

async function parseNotificationContentBackend(title: string, text: string, app: string): Promise<ParsedTransaction[]> {
  try {
    const response = await fetch(`${API_URL}/api/parse-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app, title, text })
    });

    if (!response.ok) {
      console.error('[Push Notification] API Error:', response.status);
      return [];
    }

    const json = await response.json();
    if (!json.success || !json.data || !json.data.isTransaction) {
      return [];
    }

    const transactions = json.data.transactions || [];
    return transactions.map((t: any) => ({
      type: t.type === 'expense' ? 'debit' : t.type === 'income' ? 'credit' : t.type,
      amount: t.amount,
      merchant: t.merchant || 'UPI User',
      bankName: t.bankName || (app.includes('google') ? 'Google Pay' : app.includes('phone') ? 'PhonePe' : 'UPI App'),
      accountLast4: t.accountLast4 || null,
      balance: null,
      rawMessage: `${title} ${text}`,
      senderNumber: app,
      timestamp: new Date(),
      isSplitRequest: t.isSplitRequest || false
    }));
  } catch (error) {
    console.error('[Push Notification] Fetch Error:', error);
    return [];
  }
}

// Background task bound to RNAndroidNotificationListener
const notificationHandler = async ({ notification }: { notification: string }) => {
  try {
    const parsed = JSON.parse(notification);
    console.log('[NotificationListener] Received bare notification from:', parsed.app, '| Title:', parsed.title);
    
    // Check if the notification is from a target UPI app
    if (!ALLOWED_PACKAGES.includes(parsed.app)) {
      // console.log('[NotificationListener] Ignoring package:', parsed.app);
      return;
    }
    console.log('[NotificationListener] Processing allowed package:', parsed.app);

    const title = parsed.title || '';
    const text = parsed.text || '';
    const timestamp = parsed.time || Date.now();

    if (!title && !text) {
      console.log('[NotificationListener] Empty notification, ignoring.');
      return;
    }

    const results = await parseNotificationContentBackend(title, text, parsed.app);
    if (!results || results.length === 0) return;

    for (const result of results) {
      // Run Deduplication Check
      const isDuplicate = await isDuplicateTransaction(result.amount, timestamp, 'push', parsed.app);
      if (isDuplicate) continue;

      console.log(`[Push Notification Backend] Extracted: ${result.type} ₹${result.amount} - ${result.merchant}`);

      // Queue standard transactions AND split requests
      await addTransactionToQueue(result);
      console.log('[Push Notification Backend] Queued successfully for user to review');
    }

  } catch (error) {
    console.log('Error processing notification:', error);
  }
};

export const registerNotificationListener = () => {
  if (Platform.OS === 'android') {
    AppRegistry.registerHeadlessTask(
      RNAndroidNotificationListenerHeadlessJsName,
      () => notificationHandler
    );
  }
};

export const requestNotificationPermission = async () => {
  if (Platform.OS !== 'android') return false;
  
  const status = await RNAndroidNotificationListener.getPermissionStatus();
  console.log('[NotificationListener] Current Permission Status:', status);
  if (status !== 'authorized') {
    console.log('[NotificationListener] Requesting permission (opening settings)...');
    import('react-native').then(({ Alert }) => {
      Alert.alert(
        'Notification Access Required',
        'SpendSense AI needs Notification Access to detect Google Pay, PhonePe, and PayTm transactions or splits automatically.\n\nPlease find "SpendSense AI" in the next screen and toggle it ON.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Go to Settings', 
            onPress: () => RNAndroidNotificationListener.requestPermission() 
          }
        ]
      );
    });
    return false; // User needs to grant it in native settings
  }
  return true;
};
