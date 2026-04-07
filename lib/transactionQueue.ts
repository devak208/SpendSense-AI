import * as SecureStore from 'expo-secure-store';
import { ParsedTransaction } from './bankSmsParser';

const PENDING_TRANSACTIONS_KEY = 'pending_transactions_queue';

export interface QueuedTransaction extends ParsedTransaction {
  id: string; // Unique ID for queue management
  addedAt: number;
}

/**
 * Get all pending transactions from the queue
 */
export async function getPendingTransactions(): Promise<QueuedTransaction[]> {
  try {
    const json = await SecureStore.getItemAsync(PENDING_TRANSACTIONS_KEY);
    if (!json) return [];
    return JSON.parse(json);
  } catch (error) {
    console.error('Error getting pending transactions:', error);
    return [];
  }
}

/**
 * Add a transaction to the queue
 */
export async function addTransactionToQueue(transaction: ParsedTransaction): Promise<void> {
  try {
    const currentQueue = await getPendingTransactions();
    
    // Create a robust unique ID based on transaction details
    // We already have some dedupe logic, but this is a secondary fail-safe
    const transactionId = `${transaction.timestamp}-${transaction.amount}-${transaction.senderNumber}`;
    
    // Check if exactly this transaction is already in queue
    const exists = currentQueue.some(t => 
      new Date(t.timestamp).getTime() === new Date(transaction.timestamp).getTime() && 
      t.amount === transaction.amount && 
      t.senderNumber === transaction.senderNumber
    );

    if (exists) {
      console.log('[Queue] Transaction already exists in queue:', transactionId);
      return;
    }

    const newTransaction: QueuedTransaction = {
      ...transaction,
      id: transactionId,
      addedAt: Date.now(),
    };

    const newQueue = [...currentQueue, newTransaction];
    await SecureStore.setItemAsync(PENDING_TRANSACTIONS_KEY, JSON.stringify(newQueue));
    console.log('[Queue] Transaction added. New size:', newQueue.length);
  } catch (error) {
    console.error('Error adding transaction to queue:', error);
  }
}

/**
 * Remove a transaction from the queue by ID
 */
export async function removeTransactionFromQueue(id: string): Promise<void> {
  try {
    const currentQueue = await getPendingTransactions();
    const newQueue = currentQueue.filter(t => t.id !== id);
    await SecureStore.setItemAsync(PENDING_TRANSACTIONS_KEY, JSON.stringify(newQueue));
    console.log('[Queue] Transaction removed. New size:', newQueue.length);
  } catch (error) {
    console.error('Error removing transaction from queue:', error);
  }
}

/**
 * Clear the entire queue
 */
export async function clearTransactionQueue(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_TRANSACTIONS_KEY);
  } catch (error) {
    console.error('Error clearing transaction queue:', error);
  }
}
