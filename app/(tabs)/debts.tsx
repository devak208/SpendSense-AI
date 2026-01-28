import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { getDebts, deleteDebt, markDebtAsPaid, getUserByClerkId, Debt, skipNextReminder } from '@/lib/supabase';

const DEBT_TYPE_ICONS: Record<string, string> = {
  rent: 'home',
  loan: 'dollar-sign',
  subscription: 'repeat',
  emi: 'credit-card',
  other: 'file-text',
};

const DEBT_TYPE_COLORS: Record<string, string> = {
  rent: '#F97316',
  loan: '#3B82F6',
  subscription: '#8B5CF6',
  emi: '#EC4899',
  other: '#6B7280',
};

export default function DebtsScreen() {
  const { userId } = useAuth();
  const router = useRouter();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [activeTab, setActiveTab] = useState<'owed' | 'receivable'>('owed');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initUser();
  }, [userId]);

  useEffect(() => {
    if (dbUserId) loadDebts();
  }, [dbUserId, activeTab]);

  const initUser = async () => {
    if (!userId) return;
    try {
      const user = await getUserByClerkId(userId);
      setDbUserId(user?.id || null);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const loadDebts = async () => {
    if (!dbUserId) return;
    try {
      const data = await getDebts(dbUserId, { direction: activeTab, isPaid: false });
      // Sort debts: reminders first (by next reminder time), then by due date
      const sortedData = [...data].sort((a, b) => {
        const aNextReminder = a.reminder_enabled ? getNextReminderDate(a) : null;
        const bNextReminder = b.reminder_enabled ? getNextReminderDate(b) : null;
        
        // Both have reminders - sort by next reminder time
        if (aNextReminder && bNextReminder) {
          return aNextReminder.getTime() - bNextReminder.getTime();
        }
        // Only a has reminder - a comes first
        if (aNextReminder && !bNextReminder) return -1;
        // Only b has reminder - b comes first
        if (!aNextReminder && bNextReminder) return 1;
        // Neither has reminder - sort by due date
        if (a.due_date && b.due_date) {
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        }
        return 0;
      });
      setDebts(sortedData);
    } catch (error) {
      console.error('Error loading debts:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDebts();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
  };

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const handleMarkPaid = (debt: Debt) => {
    Alert.alert(
      'Mark as Paid',
      `Mark "${debt.name}" as paid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          onPress: async () => {
            try {
              await markDebtAsPaid(debt.id);
              loadDebts();
            } catch (error) {
              Alert.alert('Error', 'Failed to update');
            }
          },
        },
      ]
    );
  };

  const handleDelete = (debt: Debt) => {
    Alert.alert(
      'Delete',
      `Delete "${debt.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDebt(debt.id);
              loadDebts();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const totalAmount = debts.reduce((sum, d) => sum + Number(d.amount), 0);

  const getReminderText = (debt: Debt) => {
    if (!debt.reminder_enabled || !debt.reminder_schedule) return null;
    
    // Format time (e.g., "10:35")
    const timeParts = debt.reminder_time.split(':');
    const timeDate = new Date();
    timeDate.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]));
    const timeStr = timeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    let scheduleStr = '';
    switch (debt.reminder_schedule) {
      case 'daily':
        scheduleStr = 'Daily';
        break;
      case 'weekly':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        scheduleStr = `Weekly on ${days[debt.reminder_day_of_week || 0]}`;
        break;
      case 'monthly':
        scheduleStr = `Monthly on day ${debt.reminder_day_of_month}`;
        break;
      case 'once':
        scheduleStr = 'One-time';
        break;
    }

    return `${scheduleStr} at ${timeStr}`;
  };

  const getNextReminderDate = (debt: Debt): Date | null => {
    if (!debt.reminder_enabled || !debt.reminder_schedule || !debt.reminder_time) return null;
    
    const now = new Date();
    const [hours, minutes] = debt.reminder_time.split(':').map(Number);
    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);

    switch (debt.reminder_schedule) {
      case 'once':
      case 'daily':
        if (result <= now) result.setDate(result.getDate() + 1);
        break;
      case 'weekly':
        const daysUntil = (7 + (debt.reminder_day_of_week || 0) - now.getDay()) % 7 || 7;
        result.setDate(result.getDate() + daysUntil);
        if (result <= now) result.setDate(result.getDate() + 7);
        break;
      case 'monthly':
        result.setDate(debt.reminder_day_of_month || 1);
        if (result <= now) result.setMonth(result.getMonth() + 1);
        break;
    }
    return result;
  };

  const getTimeUntilReminder = (debt: Debt): string | null => {
    const nextDate = getNextReminderDate(debt);
    if (!nextDate) return null;
    
    const now = new Date();
    const diffMs = nextDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHours < 24) return `in ${diffHours}h`;
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `in ${diffDays} days`;
    return nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const handleSkipReminder = (debt: Debt) => {
    Alert.alert(
      'Skip Reminder',
      `Skip the next reminder for "${debt.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: async () => {
            try {
              await skipNextReminder(debt.id);
              loadDebts();
              Alert.alert('Done', 'Next reminder skipped');
            } catch (error) {
              Alert.alert('Error', 'Failed to skip reminder');
            }
          },
        },
      ]
    );
  };

  const renderDebt = ({ item }: { item: Debt }) => {
    const color = DEBT_TYPE_COLORS[item.debt_type] || Colors.textSecondary;
    const icon = DEBT_TYPE_ICONS[item.debt_type] || 'file-text';
    const isOverdue = item.due_date && new Date(item.due_date) < new Date();
    const nextReminderIn = getTimeUntilReminder(item);

    return (
      <TouchableOpacity
        style={styles.debtCard}
        onLongPress={() => handleDelete(item)}
      >
        <View style={[styles.debtIcon, { backgroundColor: color + '20' }]}>
          <Feather name={icon as any} size={20} color={color} />
        </View>
        
        <View style={styles.debtInfo}>
          <Text style={styles.debtName}>{item.name}</Text>
          <View style={styles.debtMeta}>
            <Text style={[styles.dueDate, isOverdue && styles.overdue]}>
              {formatDueDate(item.due_date)}
            </Text>
            {item.is_recurring && (
              <View style={styles.recurringBadge}>
                <Feather name="repeat" size={10} color={Colors.success} />
              </View>
            )}
          </View>
          {item.reminder_enabled && (
            <View style={styles.reminderRow}>
              <Feather name="bell" size={12} color={Colors.primary} />
              <Text style={styles.reminderText}>{getReminderText(item)}</Text>
              {nextReminderIn && (
                <View style={styles.nextReminderBadge}>
                  <Text style={styles.nextReminderText}>Next {nextReminderIn}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.debtRight}>
          <Text style={styles.debtAmount}>{formatCurrency(item.amount)}</Text>
          <View style={styles.actionButtons}>
            {item.reminder_enabled && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => handleSkipReminder(item)}
              >
                <Feather name="fast-forward" size={14} color={Colors.warning} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.paidButton}
              onPress={() => handleMarkPaid(item)}
            >
              <Feather name="check" size={16} color={Colors.success} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Debts & Bills</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push({ pathname: '/add-debt', params: { initialDirection: activeTab } })}
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'owed' && styles.tabActive]}
          onPress={() => setActiveTab('owed')}
        >
          <Text style={[styles.tabText, activeTab === 'owed' && styles.tabTextActive]}>
            I Owe
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'receivable' && styles.tabActive]}
          onPress={() => setActiveTab('receivable')}
        >
          <Text style={[styles.tabText, activeTab === 'receivable' && styles.tabTextActive]}>
            Owed to Me
          </Text>
        </TouchableOpacity>
      </View>

      {/* Total Card */}
      <View style={[styles.totalCard, activeTab === 'owed' ? styles.owedCard : styles.receivableCard]}>
        <Text style={styles.totalLabel}>
          {activeTab === 'owed' ? 'Total to Pay' : 'Total to Receive'}
        </Text>
        <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
        <Text style={styles.debtCount}>{debts.length} items</Text>
      </View>

      {/* List */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : debts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="check-circle" size={64} color={Colors.success} />
            <Text style={styles.emptyText}>All clear!</Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'owed' ? "You don't owe anything" : 'No one owes you'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={debts}
            renderItem={renderDebt}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => router.push({ pathname: '/add-debt', params: { initialDirection: activeTab } })}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 16,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  totalCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  owedCard: {
    backgroundColor: Colors.error + '20',
  },
  receivableCard: {
    backgroundColor: Colors.success + '20',
  },
  totalLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginTop: 4,
  },
  debtCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  debtCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  debtIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debtInfo: {
    flex: 1,
    marginLeft: 12,
  },
  debtName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  debtMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  dueDate: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  overdue: {
    color: Colors.error,
  },
  reminderBadge: {
    backgroundColor: Colors.primary + '20',
    padding: 4,
    borderRadius: 4,
  },
  recurringBadge: {
    backgroundColor: Colors.success + '20',
    padding: 4,
    borderRadius: 4,
  },
  debtRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  debtAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  paidButton: {
    backgroundColor: Colors.success + '20',
    padding: 8,
    borderRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
    flexWrap: 'wrap',
  },
  reminderText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  nextReminderBadge: {
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  nextReminderText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  skipButton: {
    backgroundColor: Colors.warning + '20',
    padding: 8,
    borderRadius: 8,
  },
});
