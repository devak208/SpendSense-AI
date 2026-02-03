// Foreground Service Manager for SMS Detection using Notifee
// Keeps the app alive in background to detect SMS messages

import { Platform, Linking, DeviceEventEmitter } from 'react-native';
import notifee, { AndroidImportance, AndroidCategory, AndroidVisibility } from '@notifee/react-native';
import { startSMSListener, stopSMSListener, SMS_TRANSACTION_EVENT } from './smsReader';
import { addTransactionToQueue } from './transactionQueue';

// Logging utility
const LOG_TAG = '[ForegroundService]';
function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`${LOG_TAG} [${timestamp}] ${message}`, data);
  } else {
    console.log(`${LOG_TAG} [${timestamp}] ${message}`);
  }
}

// Notification channel ID for the foreground service
const CHANNEL_ID = 'sms-detection-service';
const NOTIFICATION_ID = 'sms-detection';

// Service state
let isServiceRunning = false;

// Subscription state
let currentSubscription: any = null;
let lastTransactionHash = '';

/**
 * Create notification channel for the foreground service
 */
async function createNotificationChannel(): Promise<string> {
  const channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'SMS Detection Service',
    description: 'Keeps the app running to detect bank SMS messages',
    importance: AndroidImportance.LOW, // Low importance = no sound, minimal visual
  });
  log('Created notification channel:', channelId);
  return channelId;
}

/**
 * Check if foreground service is supported
 */
export function isForegroundServiceSupported(): boolean {
  return Platform.OS === 'android';
}

/**
 * Check if foreground service is currently running
 */
export function isForegroundServiceRunning(): boolean {
  return isServiceRunning;
}

/**
 * Logic to handle incoming transactions
 * This is separated so it can be called from Background Task OR Main App
 */
const onTransaction = async (transaction: any) => {
  // Deduplication using robust ID
  // Note: Sender + Amount + Timestamp is usually unique enough
  const resultTimestamp = transaction.timestamp || Date.now();
  const transactionHash = `${transaction.senderNumber}-${transaction.amount}-${resultTimestamp}`;

  // Deduplication: Ignore if same transaction hash seen recently (or ever, in this session)
  if (lastTransactionHash === transactionHash) {
    log('Ignoring duplicate transaction:', transactionHash);
    return;
  }

  lastTransactionHash = transactionHash;

  log('Background transaction detected (via Event):', transaction);
  
  // PERSIST TO QUEUE IMMEDIATELY
  try {
     await addTransactionToQueue(transaction);
     log('Transaction saved to persistent queue');
  } catch (queueError) {
     log('Failed to save to queue:', queueError);
  }

  // Attempt to open the app directly via Deep Link using Intent
  const deepLinkUrl = `expensetrackerapp://?action=transaction&data=${encodeURIComponent(JSON.stringify(transaction))}`;
  
  try {
    if (Platform.OS === 'android') {
       // ... intent logic if needed ...
    } 
    await Linking.openURL(deepLinkUrl);
    log('Direct launch command sent successfully');
  } catch (err) {
       // ...
  }
  
  // Show a persistent high-priority notification
  try {
    await notifee.displayNotification({
      id: 'new_transaction_alert', 
      title: '💸 New Expense Detected',
      body: `₹${transaction.amount} at ${transaction.merchant || transaction.bankName}. Tap to add to queue.`,
      data: {
        transaction: JSON.stringify(transaction),
        type: 'new_transaction'
      },
      android: {
        channelId: 'transactions',
        pressAction: {
          id: 'add_expense',
          launchActivity: 'default',
        },
        fullScreenAction: {
          id: 'add_expense',
          launchActivity: 'default',
        },
        importance: AndroidImportance.HIGH,
        sound: 'default',
        category: AndroidCategory.ALARM,
        visibility: AndroidVisibility.PUBLIC,
        ongoing: true, // User cannot swipe away
        autoCancel: false, // Notification stays until explicitly removed
        vibrationPattern: [300, 500],
        lights: ['#7C3AED', 300, 600],
      },
    });
  } catch (error) {
    log('Error showing transaction notification:', error);
  }
};

/**
 * Starts the Transaction Listener logic
 * Ensures we are subscribed to SMS events
 */
export async function startTransactionListener() {
  log('Initializing Transaction Listener...');

  // Create high priority channel if needed (for alerts)
  await notifee.createChannel({
    id: 'transactions',
    name: 'Transaction Alerts',
    importance: AndroidImportance.HIGH, 
    sound: 'default',
    vibration: true,
    visibility: AndroidVisibility.PUBLIC,
  });

  // SUBSCRIBE TO EVENT (Prevent Duplicates)
  if (currentSubscription) {
    log('Removing existing subscription before re-registering');
    currentSubscription.remove();
  }
  
  log('Subscribing to SMS_TRANSACTION_EVENT');
  currentSubscription = DeviceEventEmitter.addListener(SMS_TRANSACTION_EVENT, onTransaction);

  // Start listening (idempotent)
  const listenerStarted = await startSMSListener();
  log(`SMS Listener start request result: ${listenerStarted}`);
}

/**
 * Register the foreground service task
 * This must be called at the root of the application (e.g., in index.js)
 */
export function registerSMSBackgroundService() {
  notifee.registerForegroundService((notification) => {
    return new Promise(async (resolve) => {
      log('Foreground service task callback fired');
      await startTransactionListener();
      // Keep promise pending to keep service alive
    });
  });
}

/**
 * Start the foreground service with a persistent notification
 * This triggers the registered task
 */
export async function startSMSForegroundService(): Promise<boolean> {
  log('Starting SMS foreground service request...');

  if (Platform.OS !== 'android') {
    log('Foreground service only available on Android');
    return false;
  }

  // FORCE RESTART checks
  // If we think it's NOT running (fresh JS load), force stop to ensure clean native state
  // This helps triggers the registerForegroundService callback again
  if (!isServiceRunning) {
    log('Ensuring clean state (Force Stop)...');
    try {
      await stopSMSForegroundService();
    } catch (e) {
      log('Error during force stop (clean state):', e);
    }
  }

  if (isServiceRunning) {
    log('Service already running (JS confirmed)');
    return true;
  }

  try {
    // Create/get notification channel
    const channelId = await createNotificationChannel();

    // Display persistent notification that keeps service alive
    // This triggers the registered foreground service task
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: '💰 Expense Tracker Active',
      body: 'Listening for bank SMS messages...',
      android: {
        channelId,
        asForegroundService: true,
        ongoing: true, // Cannot be swiped away
        pressAction: {
          id: 'default',
        },
        actions: [
          {
            title: 'Stop Service',
            pressAction: {
              id: 'stop_service',
            },
          },
        ],
        smallIcon: 'ic_launcher', // Uses app icon
        importance: AndroidImportance.LOW,
      },
    });

    isServiceRunning = true;
    log('✅ Foreground service started successfully');

    // CRITICAL: Manually start the listener as well. 
    // This ensures that even if the Foreground Task callback doesn't fire (due to reload racing),
    // we still have the listener active in the current JS context.
    await startTransactionListener();

    return true;
  } catch (error) {
    log('❌ Failed to start foreground service:', error);
    return false;
  }
}

/**
 * Stop the foreground service
 */
export async function stopSMSForegroundService(): Promise<void> {
  log('Stopping SMS foreground service...');

  try {
    await notifee.stopForegroundService();
    
    // Stop the listener
    stopSMSListener();
    
    // Unsubscribe
    if (currentSubscription) {
      currentSubscription.remove();
      currentSubscription = null;
    }
    
    isServiceRunning = false;
    log('✅ Foreground service stopped');
  } catch (error) {
    log('❌ Failed to stop foreground service:', error);
  }
}

/**
 * Update the notification text (e.g., to show transaction count)
 */
export async function updateForegroundNotification(body: string): Promise<void> {
  if (!isServiceRunning) return;

  try {
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: '💰 Expense Tracker Active',
      body,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        ongoing: true,
        pressAction: {
          id: 'default',
        },
        actions: [
          {
            title: 'Stop Service',
            pressAction: {
              id: 'stop_service',
            },
          },
        ],
        smallIcon: 'ic_launcher',
        importance: AndroidImportance.LOW,
      },
    });
    log('Notification updated:', body);
  } catch (error) {
    log('Failed to update notification:', error);
  }
}
