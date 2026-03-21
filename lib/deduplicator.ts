import * as SecureStore from 'expo-secure-store';

const RECENT_TRANSACTIONS_KEY = 'dedupe_recent_transactions';
const DEDUPE_WINDOW_MINUTES = 5;

export interface DedupeTransaction {
  id: string;
  timestamp: number;
  amount: number;
  source: 'sms' | 'push';
  sender: string;
}

/**
 * Checks if a transaction is a duplicate based on amount and time.
 * If not, it adds it to the recent transactions list.
 */
export async function isDuplicateTransaction(
  amount: number,
  timestamp: number,
  source: 'sms' | 'push',
  sender: string
): Promise<boolean> {
  try {
    const json = await SecureStore.getItemAsync(RECENT_TRANSACTIONS_KEY);
    let recent: DedupeTransaction[] = json ? JSON.parse(json) : [];

    // Clean up old transactions (older than 15 minutes) to keep storage light
    const now = Date.now();
    recent = recent.filter(t => (now - t.timestamp) <= 15 * 60 * 1000);

    // Check if there is a matching transaction
    const isDuplicate = recent.some(t => {
      const timeDiffMinutes = Math.abs(t.timestamp - timestamp) / (1000 * 60);
      const isSameAmount = Math.abs(t.amount - amount) < 0.01;
      
      if (!isSameAmount) return false;

      // 1. Cross-Source Deduplication (e.g. Bank SMS + GPay Push)
      // Usually arrives within a few seconds to a minute of each other.
      if (t.source !== source && timeDiffMinutes <= 0.2) { // 5 minutes again, as 30s can be too short for telecom delays
        return true;
      }

      // 2. Same-Source, DIFFERENT Sender (e.g. SBI SMS + Bank of India SMS for the same transfer)
      if (t.source === source && t.sender !== sender && timeDiffMinutes <= 0.2) {
        return true;
      }

      // 3. Same-Source, SAME Sender (e.g. 2 identical Push notifications)
      // If a friend pays ₹100 twice, it realistically takes > 15 seconds.
      // If the Android OS accidentally fires the SAME notification twice, it happens instantly.
      if (t.source === source && t.sender === sender && timeDiffMinutes <= 0.25) { // 15 seconds
        return true;
      }

      return false;
    });

    if (!isDuplicate) {
      // Add to recent cache
      recent.push({
        id: `${timestamp}-${amount}-${sender}`,
        timestamp,
        amount,
        source,
        sender,
      });
      await SecureStore.setItemAsync(RECENT_TRANSACTIONS_KEY, JSON.stringify(recent));
      return false;
    }

    console.log(`[Deduplicator] Filtered duplicate transaction! Amount: ₹${amount} from source: ${source}`);
    return true;
  } catch (error) {
    console.error('Error in deduplicator:', error);
    // If we fail to read/write, default to false so we don't accidentally drop data
    return false;
  }
}
