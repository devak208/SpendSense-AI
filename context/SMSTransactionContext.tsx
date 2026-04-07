// SMS Transaction Context
// Global state management for SMS transaction detection

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Alert, Platform, AppState, AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
import { useAuth } from '@clerk/clerk-expo';

import { ParsedTransaction } from '@/lib/bankSmsParser';
import {
  checkSMSPermission,
  requestSMSPermission,
  isSMSReadingSupported,
  testSMSParsing,
  getSMSHistory,
  clearSMSHistory,
  stopSMSListener // Helper to ensure we can stop if needed directly
} from '@/lib/smsReader';
import {
  getUserByClerkId,
  getCategories,
  getPaymentMethods,
  createExpense,
  getUserCategories,
  Category,
  PaymentMethod,
  UserCategory,
  createDebt
} from '@/lib/supabase';
import TransactionDetectedModal from '@/components/TransactionDetectedModal';
import {
  startSMSForegroundService,
  stopSMSForegroundService
} from '@/lib/foregroundService';
import notifee, { EventType } from '@notifee/react-native';
import {
  addTransactionToQueue,
  getPendingTransactions,
  removeTransactionFromQueue,
  QueuedTransaction
} from '@/lib/transactionQueue';

interface SMSTransactionContextType {
  isEnabled: boolean;
  isSupported: boolean;
  hasPermission: boolean;
  isListening: boolean;
  enableSMSDetection: () => Promise<boolean>;
  disableSMSDetection: () => Promise<void>;
  checkPermission: () => Promise<boolean>;
  // Debug functions
  testParsing: (sender: string, message: string) => ParsedTransaction | null;
  getHistory: () => ReturnType<typeof getSMSHistory>;
  clearHistory: () => void;
}

const SMSTransactionContext = createContext<SMSTransactionContextType | null>(null);

export function useSMSTransaction() {
  const context = useContext(SMSTransactionContext);
  if (!context) {
    throw new Error('useSMSTransaction must be used within SMSTransactionProvider');
  }
  return context;
}

interface SMSTransactionProviderProps {
  children: ReactNode;
}

export function SMSTransactionProvider({ children }: SMSTransactionProviderProps) {
  const { userId, isSignedIn } = useAuth();

  const [isEnabled, setIsEnabled] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dbUserId, setDbUserId] = useState<string | null>(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  // Ref mirrors modalVisible for stale-closure-free reads inside callbacks
  const modalVisibleRef = useRef(false);
  // Mutex: prevents concurrent processQueue calls from both opening the modal
  const isProcessingQueueRef = useRef(false);
  const [currentTransaction, setCurrentTransaction] = useState<QueuedTransaction | null>(null);

  // Data for modal
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<UserCategory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Check if SMS reading is supported
  useEffect(() => {
    setIsSupported(isSMSReadingSupported());
  }, []);

  // Initialize user and data when signed in
  useEffect(() => {
    if (isSignedIn && userId) {
      initializeUser();
    } else {
      // Cleanup on signout
      stopSMSForegroundService().catch(console.error);
      setIsListening(false);
      setDbUserId(null);
    }
  }, [isSignedIn, userId]);

  const initializeUser = async () => {
    if (!userId) return;

    try {
      const user = await getUserByClerkId(userId);
      if (user) {
        setDbUserId(user.id);

        // Load categories and payment methods for the modal
        const [cats, userCats, pms] = await Promise.all([
          getCategories(user.id),
          getUserCategories(user.id),
          getPaymentMethods(),
        ]);
        setCategories(cats);
        setSubCategories(userCats.all || []);
        setPaymentMethods(pms);

        // Check permission status
        const permStatus = await checkSMSPermission();
        const hasPerm = permStatus.hasReadSmsPermission && permStatus.hasReceiveSmsPermission;
        setHasPermission(hasPerm);

        if (hasPerm) {
          console.log('[SMSContext] Permissions granted, ensuring service is active...');
          enableSMSDetection();
        }
      }
    } catch (error) {
      console.error('Error initializing SMS context:', error);
    }
  };

  // PROCESS QUEUE: Check if there are items and show the first one
  const processQueue = useCallback(async () => {
    // Use the ref (not the state) to get the true current value — avoids stale closure
    if (modalVisibleRef.current) return;
    // Mutex: only one invocation runs at a time
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    try {
      const queue = await getPendingTransactions();
      if (queue.length > 0) {
        console.log('[SMSContext] Processing queue. Items pending:', queue.length);

        // Refresh categories before showing modal to get any newly created ones
        if (dbUserId) {
          try {
            const [cats, userCats] = await Promise.all([
              getCategories(dbUserId),
              getUserCategories(dbUserId),
            ]);
            setCategories(cats);
            setSubCategories(userCats.all || []);
          } catch (e) {
            console.error('[SMSContext] Error refreshing categories:', e);
          }
        }

        const nextItem = queue[0];
        setCurrentTransaction(nextItem);
        modalVisibleRef.current = true;
        setModalVisible(true);
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  // dbUserId is the only true dep — modalVisible is now read via ref
  }, [dbUserId]);

  // Handle detected transaction (from SMS or Deep Link)
  const handleTransactionDetected = useCallback(async (transaction: ParsedTransaction) => {
    console.log('[SMSContext] New transaction detected. Adding to queue:', transaction);
    // Add to persistent queue (has internal dedup)
    await addTransactionToQueue(transaction);
    // Try to process immediately
    await processQueue();
  }, [processQueue]);

  // Monitor queue when modal closes or app wakes
  useEffect(() => {
    if (!modalVisible) {
      modalVisibleRef.current = false;
      processQueue();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalVisible]); // processQueue intentionally excluded — it's stable and reads via ref

  // Also check queue on mount/auth load
  useEffect(() => {
    if (isSignedIn && hasPermission) {
      processQueue();
    }
  }, [isSignedIn, hasPermission, processQueue]);

  // AppState listener: process queue whenever app comes to foreground
  // This handles: SMS arrives while app is backgrounded → user opens app → modal should fire
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[SMSContext] App came to foreground — checking queue');
        processQueue();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [processQueue]);

  // Foreground polling: check queue every 3s while app is active
  // This handles: SMS/UPI notification arrives while user is already using the app
  // without this, the modal would only appear after the user closes/reopens
  useEffect(() => {
    if (!isSignedIn || !hasPermission) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        processQueue();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isSignedIn, hasPermission, processQueue]);

  // Handle Deep Links (legacy — kept for cold-start fallback but no longer adds to queue)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      // Only process transaction action deep links
      if (url && (url.includes('action=transaction') || url.includes('data='))) {
        console.log('[SMSContext] Deep link received — triggering processQueue (transaction already in queue from service)');
        // The foreground service already added this transaction to the queue.
        // We just need to process the queue, NOT add it again.
        processQueue();
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check initial URL (Cold start from Deep Link)
    Linking.getInitialURL().then((url) => {
      if (url && (url.includes('action=transaction') || url.includes('data='))) {
        console.log('[SMSContext] App started with deep link — processing queue');
        // Small delay to allow app to fully initialize before showing modal
        setTimeout(() => processQueue(), 1000);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [processQueue]);

  // Ref to track if initial notification was processed to prevent loops
  const initialNotificationProcessed = useRef(false);

  // Handle notification interactions (foreground & background press)
  useEffect(() => {
    // 1. Handle app launch from notification (Cold Start) - RUN ONCE ONLY
    if (!initialNotificationProcessed.current) {
      notifee.getInitialNotification().then(initialNotification => {
        if (initialNotification?.notification.data?.type === 'new_transaction') {
          console.log('[SMSContext] App launched from transaction notification (Initial) — processing queue');
          initialNotificationProcessed.current = true;
          // Transaction is already in queue from the foreground service.
          // Just process the queue after a short delay for app init.
          setTimeout(() => processQueue(), 1000);
        }
      });
    }

    // 2. Handle foreground/background notification tap
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification?.data?.type === 'new_transaction') {
        console.log('[SMSContext] Transaction notification tapped — processing queue (not re-adding)');
        // Transaction is already in queue. Just surface the modal.
        processQueue();
      }
    });

    return unsubscribe;
  }, []); // Empty deps — processQueue is called via ref so no stale closure risk

  // Enable SMS detection
  const enableSMSDetection = async (): Promise<boolean> => {
    if (!isSupported) {
      return false;
    }

    // Check permissions
    let permStatus = await checkSMSPermission();

    if (!permStatus.hasReadSmsPermission || !permStatus.hasReceiveSmsPermission) {
      const granted = await requestSMSPermission();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'SMS permission is needed to detect bank transactions automatically.',
          [{ text: 'OK' }]
        );
        return false;
      }
      permStatus = await checkSMSPermission();
    }

    setHasPermission(permStatus.hasReadSmsPermission && permStatus.hasReceiveSmsPermission);

    if (!permStatus.hasReadSmsPermission || !permStatus.hasReceiveSmsPermission) {
      return false;
    }

    // Start foreground service (This is the SOLE listener)
    try {
      const serviceStarted = await startSMSForegroundService();
      if (serviceStarted) {
        console.log('[SMSContext] Foreground service started (Sole Listener)');
        setIsEnabled(true);
      }

      setIsListening(serviceStarted);
      return serviceStarted;
    } catch (e) {
      console.error('[SMSContext] Failed to start service:', e);
      return false;
    }
  };

  // Disable SMS detection
  const disableSMSDetection = async () => {
    try {
      await stopSMSForegroundService();
      setIsListening(false);
      setIsEnabled(false);
    } catch (e) {
      console.error('[SMSContext] Failed to stop service:', e);
    }
  };

  // Check permission only
  const checkPermission = async (): Promise<boolean> => {
    const status = await checkSMSPermission();
    const hasPerm = status.hasReadSmsPermission && status.hasReceiveSmsPermission;
    setHasPermission(hasPerm);
    return hasPerm;
  };

  // Handle save from modal
  const handleSaveTransaction = async (data: {
    amount: number;
    type: 'expense' | 'income';
    categoryId: string;
    userCategoryId?: string;
    paymentMethodId: string;
    note: string;
  }) => {
    if (!dbUserId || !currentTransaction) return;

    try {
      await createExpense({
        user_id: dbUserId,
        category_id: data.categoryId,
        user_category_id: data.userCategoryId,
        payment_method_id: data.paymentMethodId,
        amount: data.amount,
        type: data.type,
        note: (() => {
          let finalNote = data.note;
          // Append rich details to note if available
          const details = [];
          if (currentTransaction.merchant) details.push(`Merchant: ${currentTransaction.merchant}`);
          if (currentTransaction.senderNumber) details.push(`Sender: ${currentTransaction.senderNumber}`);
          if (currentTransaction.accountLast4) details.push(`Acc: ..${currentTransaction.accountLast4}`);
          if (currentTransaction.bankName) details.push(`Bank: ${currentTransaction.bankName}`);

          if (details.length > 0) {
            finalNote = `${finalNote ? finalNote + '\n' : ''}[SMS: ${details.join(' | ')}]`;
          }
          return finalNote;
        })(),
        expense_date: new Date().toISOString().split('T')[0],
      });

      console.log('Transaction saved successfully');

      // Remove from queue and close modal
      await removeTransactionFromQueue(currentTransaction.id);
      await notifee.cancelNotification('new_transaction_alert');
      modalVisibleRef.current = false;
      setModalVisible(false);
      setCurrentTransaction(null);
      // processQueue for the next item triggers via the modalVisible useEffect

    } catch (error) {
      console.error('Error saving transaction:', error);
      Alert.alert('Error', 'Failed to save transaction. Please try again.');
    }
  };

  const handleSaveDebt = async (data: {
    amount: number;
    name: string;
    direction: 'owed' | 'receivable';
    note: string;
  }) => {
    if (!dbUserId || !currentTransaction) return;

    try {
      let finalNote = data.note || '';
      if (currentTransaction.merchant || currentTransaction.senderNumber) {
         finalNote += `\n[Auto-detected by SpendSense via ${currentTransaction.bankName || 'SMS'}]`;
      }

      await createDebt({
        user_id: dbUserId,
        name: data.name,
        amount: data.amount,
        direction: data.direction,
        debt_type: 'other',
        description: finalNote.trim(),
      });

      console.log('Debt saved successfully');

      await removeTransactionFromQueue(currentTransaction.id);
      await notifee.cancelNotification('new_transaction_alert');
      modalVisibleRef.current = false;
      setModalVisible(false);
      setCurrentTransaction(null);
    } catch (error) {
      console.error('Error saving debt:', error);
      Alert.alert('Error', 'Failed to save split. Please try again.');
    }
  };

  // Handle dismiss modal
  const handleDismissModal = async () => {
    if (currentTransaction) {
      await removeTransactionFromQueue(currentTransaction.id);
    }
    await notifee.cancelNotification('new_transaction_alert');
    modalVisibleRef.current = false;
    setModalVisible(false);
    setCurrentTransaction(null);
  };

  const contextValue: SMSTransactionContextType = {
    isEnabled,
    isSupported,
    hasPermission,
    isListening,
    enableSMSDetection,
    disableSMSDetection,
    checkPermission,
    // Debug functions
    testParsing: testSMSParsing,
    getHistory: getSMSHistory,
    clearHistory: clearSMSHistory,
  };

  return (
    <SMSTransactionContext.Provider value={contextValue}>
      {children}
      <TransactionDetectedModal
        visible={modalVisible}
        transaction={currentTransaction}
        categories={categories}
        subCategories={subCategories}
        paymentMethods={paymentMethods}
        onSave={handleSaveTransaction}
        onSaveDebt={handleSaveDebt}
        onDismiss={handleDismissModal}
        onCategoryCreated={(newCat) => setCategories(prev => [...prev, newCat])}
        onSubCategoryCreated={(newSub) => setSubCategories(prev => [...prev, newSub])}
      />
    </SMSTransactionContext.Provider>
  );
}
