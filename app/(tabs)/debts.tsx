import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/Colors';
import { getDebts, deleteDebt, markDebtAsPaid, getUserByClerkId, Debt, skipNextReminder, getExpenses } from '@/lib/supabase';

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

// Skeleton Component
const SkeletonBox = ({ width, height, style }: { width: number | string; height: number; style?: any }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(animatedValue, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View
      style={[{ width, height, backgroundColor: Colors.border, borderRadius: 8, opacity }, style]}
    />
  );
};

// Loading Skeleton
const ListSkeleton = () => (
  <View style={{ paddingHorizontal: 20 }}>
    {[1, 2, 3].map(i => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: Colors.card, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border }}>
        <SkeletonBox width={40} height={40} style={{ borderRadius: 10, marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <SkeletonBox width={120} height={14} style={{ marginBottom: 6 }} />
          <SkeletonBox width={80} height={10} />
        </View>
        <SkeletonBox width={60} height={16} />
      </View>
    ))}
  </View>
);

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

// ... (existing imports)

export default function DebtsScreen() {
  const { userId } = useAuth();
  const router = useRouter();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [activeTab, setActiveTab] = useState<'owed' | 'receivable'>('owed');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settlementStats, setSettlementStats] = useState<{
    currentBalance: number;
    totalPayable: number;
    totalReceivable: number;
    netSettlement: number;
    projectedBalance: number;
  } | null>(null);

  useEffect(() => { initUser(); }, [userId]);
  
  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (dbUserId) {
        loadDebts();
      }
    }, [dbUserId])
  );

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
      // Keep loading silent if not initial load to avoid flicker on focus
      if (debts.length === 0) setLoading(true);
      
      const [allDebts, allExpenses] = await Promise.all([
        getDebts(dbUserId, { isPaid: false }),
        getExpenses(dbUserId)
      ]);

      // Calculate Current Balance
      const totalIncome = allExpenses
        .filter(e => e.type === 'income')
        .reduce((sum, e) => sum + e.amount, 0);
      const totalExpenses = allExpenses
        .filter(e => e.type === 'expense' || !e.type)
        .reduce((sum, e) => sum + e.amount, 0);
      const currentBalance = totalIncome - totalExpenses;

      // Calculate Settlement Stats
      const totalPayable = allDebts
        .filter(d => d.direction === 'owed')
        .reduce((sum, d) => sum + Number(d.amount), 0);
      
      const totalReceivable = allDebts
        .filter(d => d.direction === 'receivable')
        .reduce((sum, d) => sum + Number(d.amount), 0);

      const netSettlement = totalReceivable - totalPayable;
      const projectedBalance = currentBalance + netSettlement;

      setSettlementStats({
        currentBalance,
        totalPayable,
        totalReceivable,
        netSettlement,
        projectedBalance
      });

      const sortedData = [...allDebts].sort((a, b) => {
        const aNextReminder = a.reminder_enabled ? getNextReminderDate(a) : null;
        const bNextReminder = b.reminder_enabled ? getNextReminderDate(b) : null;
        
        if (aNextReminder && bNextReminder) {
          return aNextReminder.getTime() - bNextReminder.getTime();
        }
        if (aNextReminder && !bNextReminder) return -1;
        if (!aNextReminder && bNextReminder) return 1;
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
    
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays}d`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const handleMarkPaid = (debt: Debt) => {
    Alert.alert('Mark as Paid', `Mark "${debt.name}" as paid?`, [
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
    ]);
  };

  const handleDelete = (debt: Debt) => {
    Alert.alert('Delete', `Delete "${debt.name}"?`, [
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
    ]);
  };
  
  // Filter debts based on active tab
  const filteredDebts = debts.filter(d => d.direction === activeTab);
  
  // Calculate total for the ACTIVE tab specifically
  const totalAmount = filteredDebts.reduce((sum, d) => sum + Number(d.amount), 0);

  const getReminderText = (debt: Debt) => {
    if (!debt.reminder_enabled || !debt.reminder_schedule) return null;
    
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
        scheduleStr = `${days[debt.reminder_day_of_week || 0]}`;
        break;
      case 'monthly':
        scheduleStr = `${debt.reminder_day_of_month}th`;
        break;
      case 'once':
        scheduleStr = 'Once';
        break;
    }

    return `${scheduleStr} · ${timeStr}`;
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

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `${diffDays}d`;
    return nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const handleSkipReminder = (debt: Debt) => {
    Alert.alert('Skip Reminder', `Skip the next reminder for "${debt.name}"?`, [
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
    ]);
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
        activeOpacity={0.7}
      >
        <View style={[styles.debtIcon, { backgroundColor: color + '15' }]}>
          <Feather name={icon as any} size={16} color={color} />
        </View>
        
        <View style={styles.debtInfo}>
          <Text style={styles.debtName} numberOfLines={1}>{item.name}</Text>
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
              <Feather name="bell" size={10} color={Colors.gold} />
              <Text style={styles.reminderText}>{getReminderText(item)}</Text>
              {nextReminderIn && (
                <View style={styles.nextReminderBadge}>
                  <Text style={styles.nextReminderText}>{nextReminderIn}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.debtRight}>
          <Text style={[styles.debtAmount, activeTab === 'receivable' && { color: Colors.success }]}>
            {formatCurrency(item.amount)}
          </Text>
          <View style={styles.actionButtons}>
            {item.reminder_enabled && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => handleSkipReminder(item)}
              >
                <Feather name="fast-forward" size={12} color={Colors.gold} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.paidButton}
              onPress={() => handleMarkPaid(item)}
            >
              <Feather name="check" size={14} color={Colors.success} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={[Colors.goldLight, Colors.background]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Debts & Bills</Text>
        </View>

        {/* Decorative Feature Card */}
        <View style={styles.featureCard}>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>
              <Text style={{ color: Colors.gold }}>Manage</Text> your payments
            </Text>
            <Text style={styles.featureSubtitle}>Track debts, bills & reminders</Text>
          </View>
          <View style={styles.featureDecor}>
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
            <View style={styles.decorIcon}>
              <Feather name="clock" size={20} color={Colors.gold} />
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'owed' && styles.tabActiveOwed]}
          onPress={() => setActiveTab('owed')}
        >
          <Feather name="arrow-up-right" size={14} color={activeTab === 'owed' ? '#FFF' : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'owed' && styles.tabTextActive]}>
            I Owe
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'receivable' && styles.tabActiveReceivable]}
          onPress={() => setActiveTab('receivable')}
        >
          <Feather name="arrow-down-left" size={14} color={activeTab === 'receivable' ? '#FFF' : Colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'receivable' && styles.tabTextActive]}>
            Owed to Me
          </Text>
        </TouchableOpacity>
      </View>

      {/* Settlement Balance Card */}
      {settlementStats && (
        <View style={styles.settlementCard}>
           <Text style={styles.settlementLabel}>Balance after Settlement</Text>
           <View style={styles.settlementRow}>
             <Text style={styles.settlementAmount}>{formatCurrency(settlementStats.projectedBalance)}</Text>
             <View style={[
               styles.settlementBadge, 
               settlementStats.netSettlement >= 0 ? styles.badgePositive : styles.badgeNegative
             ]}>
               <Feather 
                 name={settlementStats.netSettlement >= 0 ? "arrow-up" : "arrow-down"} 
                 size={12} 
                 color={settlementStats.netSettlement >= 0 ? Colors.success : Colors.error} 
               />
               <Text style={[
                 styles.settlementBadgeText,
                 { color: settlementStats.netSettlement >= 0 ? Colors.success : Colors.error }
               ]}>
                 {formatCurrency(Math.abs(settlementStats.netSettlement))}
               </Text>
             </View>
           </View>
           <Text style={styles.settlementSubtext}>
             Current: {formatCurrency(settlementStats.currentBalance)}
           </Text>
        </View>
      )}

      {/* Total Card */}
      <View style={[styles.totalCard, activeTab === 'owed' ? styles.owedCard : styles.receivableCard]}>
        <View style={styles.totalLeft}>
          <Text style={styles.totalLabel}>
            {activeTab === 'owed' ? 'Total to Pay' : 'Total to Receive'}
          </Text>
          <Text style={[styles.totalAmount, activeTab === 'receivable' && { color: Colors.success }]}>
            {formatCurrency(totalAmount)}
          </Text>
        </View>
        <View style={styles.totalRight}>
          <View style={[styles.countBadge, activeTab === 'receivable' && { backgroundColor: Colors.successLight }]}>
            <Text style={[styles.countText, activeTab === 'receivable' && { color: Colors.success }]}>
              {filteredDebts.length} items
            </Text>
          </View>
        </View>
      </View>

      {/* List */}
      <View style={{ flex: 1 }}>
        {(loading) ? (
          <ListSkeleton />
        ) : filteredDebts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Feather name="check-circle" size={40} color={Colors.success} />
            </View>
            <Text style={styles.emptyText}>All clear!</Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'owed' ? "You don't owe anything" : 'No one owes you'}
            </Text>
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={() => router.push({ pathname: '/add-debt', params: { initialDirection: activeTab } })}
            >
              <Feather name="plus" size={16} color="#FFF" />
              <Text style={styles.emptyButtonText}>Add New</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredDebts}
            renderItem={renderDebt}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
          />
        )}
      </View>

      {/* Single FAB */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => router.push({ pathname: '/add-debt', params: { initialDirection: activeTab } })}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header with Gradient
  headerGradient: {
    paddingBottom: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Decorative Feature Card
  featureCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  featureDecor: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  decorCircle1: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.goldLight,
    opacity: 0.5,
    top: -5,
    right: -5,
  },
  decorCircle2: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.errorLight,
    opacity: 0.5,
    bottom: 0,
    right: 15,
  },
  decorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabActiveOwed: {
    backgroundColor: Colors.error,
  },
  tabActiveReceivable: {
    backgroundColor: Colors.success,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Total Card
  totalCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  owedCard: {
    backgroundColor: Colors.errorLight,
  },
  receivableCard: {
    backgroundColor: Colors.successLight,
  },
  totalLeft: {},
  totalLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  totalAmount: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.error,
    marginTop: 2,
  },
  totalRight: {},
  countBadge: {
    backgroundColor: Colors.error + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.error,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  debtCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debtIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debtInfo: {
    flex: 1,
    marginLeft: 12,
  },
  debtName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  debtMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  dueDate: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  overdue: {
    color: Colors.error,
    fontWeight: '600',
  },
  recurringBadge: {
    backgroundColor: Colors.successLight,
    padding: 3,
    borderRadius: 4,
  },
  debtRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  debtAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.error,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  paidButton: {
    backgroundColor: Colors.successLight,
    padding: 6,
    borderRadius: 6,
  },
  skipButton: {
    backgroundColor: Colors.goldLight,
    padding: 6,
    borderRadius: 6,
  },

  // Reminder
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  reminderText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  nextReminderBadge: {
    backgroundColor: Colors.goldLight,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  nextReminderText: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.gold,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },

  // Settlement Card
  settlementCard: {
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settlementLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  settlementAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  settlementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgePositive: {
    backgroundColor: Colors.successLight,
  },
  badgeNegative: {
    backgroundColor: Colors.errorLight,
  },
  settlementBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settlementSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});
