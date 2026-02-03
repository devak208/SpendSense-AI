// SMS Transaction Context
// Global state management for SMS transaction detection

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Alert, Platform, AppState } from 'react-native';
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
  UserCategory 
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
  // Renamed from pendingTransaction for clarity, now pulls from queue
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
    // If modal is already showing, don't interrupt
    if (modalVisible) return;

    const queue = await getPendingTransactions();
    if (queue.length > 0) {
      console.log('[SMSContext] Processing queue. Items pending:', queue.length);
      const nextItem = queue[0];
      setCurrentTransaction(nextItem);
      setModalVisible(true);
    } else {
      // Queue empty
    }
  }, [modalVisible]);

  // Handle detected transaction (from SMS or Deep Link)
  const handleTransactionDetected = useCallback(async (transaction: ParsedTransaction) => {
    console.log('[SMSContext] New transaction detected. Adding to queue:', transaction);
    
    // Add to persistent queue
    await addTransactionToQueue(transaction);
    
    // Try to process immediately
    await processQueue();
  }, [processQueue]);

  // Monitor queue when modal closes or app wakes
  useEffect(() => {
    if (!modalVisible) {
      processQueue();
    }
  }, [modalVisible, processQueue]);
  
  // Also check queue on mount/auth load
  useEffect(() => {
    if (isSignedIn && hasPermission) {
      processQueue();
    }
  }, [isSignedIn, hasPermission, processQueue]);

  // Handle Deep Links (triggered by ForegroundService)
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      // Check for transaction action
      if (url && (url.includes('action=transaction') || url.includes('data='))) {
        console.log('[SMSContext] Deep link received:', url);
        try {
          // Extract data param
          const match = url.match(/data=([^&]+)/);
          if (match && match[1]) {
            const dataStr = match[1];
            // Single decode is usually sufficient if we encoded once
            const decoded = decodeURIComponent(dataStr);
            console.log('[SMSContext] Decoded deep link data:', decoded.substring(0, 50) + '...');
            const transaction = JSON.parse(decoded);
            handleTransactionDetected(transaction);
          }
        } catch (e) {
          console.error('[SMSContext] Error parsing deep link data:', e);
        }
      }
    };

    // Listen for incoming links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check initial URL (Cold start from Deep Link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[SMSContext] App started with deep link');
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleTransactionDetected]);

  // Ref to track if initial notification was processed to prevent loops
  const initialNotificationProcessed = useRef(false);
  
  // Keep latest handler in ref to access inside stable effects
  const handleTransactionDetectedRef = useRef(handleTransactionDetected);
  useEffect(() => {
    handleTransactionDetectedRef.current = handleTransactionDetected;
  }, [handleTransactionDetected]);

  // Handle notification interactions (foreground & background press)
  useEffect(() => {
    // 1. Handle app launch from notification (Cold Start) - RUN ONCE ONLY
    if (!initialNotificationProcessed.current) {
        notifee.getInitialNotification().then(initialNotification => {
        if (initialNotification?.notification.data?.type === 'new_transaction') {
            const transactionData = initialNotification.notification.data.transaction;
            if (typeof transactionData === 'string') {
            try {
                const transaction = JSON.parse(transactionData);
                console.log('[SMSContext] App launched from transaction notification (Initial):', transaction);
                initialNotificationProcessed.current = true; // Mark as processed
                // Delay slightly to allow app to initialize
                setTimeout(() => {
                   handleTransactionDetectedRef.current(transaction);
                }, 1000);
            } catch (e) {
                console.error('Error parsing initial notification data:', e);
            }
            }
        }
        });
    }

    // 2. Handle foreground/background events while app is in memory
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification?.data?.type === 'new_transaction') {
        const transactionData = detail.notification.data.transaction;
        if (typeof transactionData === 'string') {
          try {
            const transaction = JSON.parse(transactionData);
            console.log('[SMSContext] Notification tapped (foreground event):', transaction);
            handleTransactionDetectedRef.current(transaction);
          } catch (e) {
            console.error('Error parsing notification data:', e);
          }
        }
      }
    });

    return unsubscribe;
  }, []); // Empty dependency array ensures this effect setup (and especially getInitialNotification) runs once

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
      setModalVisible(false);
      setCurrentTransaction(null);
      
      // Process next item will trigger via useEffect when modalVisible becomes false
      
    } catch (error) {
      console.error('Error saving transaction:', error);
      Alert.alert('Error', 'Failed to save transaction. Please try again.');
    }
  };

  // Handle dismiss modal
  const handleDismissModal = async () => {
    if (currentTransaction) {
      // Remove from queue logic as per user request
      await removeTransactionFromQueue(currentTransaction.id);
    }
    await notifee.cancelNotification('new_transaction_alert');
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
        onDismiss={handleDismissModal}
      />
    </SMSTransactionContext.Provider>
  );
}
