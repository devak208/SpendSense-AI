import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
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

import { Colors, CategoryIcons } from '@/constants/Colors';
import {
  getExpenses,
  deleteExpense,
  getUserByClerkId,
  ExpenseWithDetails,
} from '@/lib/supabase';

type GroupedExpenses = {
  date: string;
  displayDate: string;
  expenses: ExpenseWithDetails[];
  total: number;
};

// Skeleton Loading Component
const SkeletonBox = ({ width, height, style }: { width: number | string; height: number; style?: any }) => {
  const animatedValue = new Animated.Value(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: Colors.border,
          borderRadius: 8,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Skeleton for Transaction Item
const TransactionSkeleton = () => (
  <View style={styles.transactionItem}>
    <SkeletonBox width={38} height={38} style={{ borderRadius: 10 }} />
    <View style={{ flex: 1, marginLeft: 10 }}>
      <SkeletonBox width={100} height={14} style={{ marginBottom: 6 }} />
      <SkeletonBox width={60} height={10} />
    </View>
    <SkeletonBox width={50} height={14} />
  </View>
);

// Skeleton for Summary Card
const SummarySkeleton = () => (
  <View style={styles.summaryCard}>
    <View style={styles.summaryItem}>
      <SkeletonBox width={36} height={36} style={{ borderRadius: 18, marginBottom: 6 }} />
      <SkeletonBox width={40} height={10} style={{ marginBottom: 4 }} />
      <SkeletonBox width={50} height={14} />
    </View>
    <View style={styles.summaryDivider} />
    <View style={styles.summaryItem}>
      <SkeletonBox width={36} height={36} style={{ borderRadius: 18, marginBottom: 6 }} />
      <SkeletonBox width={45} height={10} style={{ marginBottom: 4 }} />
      <SkeletonBox width={50} height={14} />
    </View>
    <View style={styles.summaryDivider} />
    <View style={styles.summaryItem}>
      <SkeletonBox width={36} height={36} style={{ borderRadius: 18, marginBottom: 6 }} />
      <SkeletonBox width={40} height={10} style={{ marginBottom: 4 }} />
      <SkeletonBox width={50} height={14} />
    </View>
  </View>
);

// Full Loading Skeleton
const LoadingSkeleton = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2, 3, 4, 5].map((i) => (
      <TransactionSkeleton key={i} />
    ))}
  </View>
);

export default function ExpensesScreen() {
  const { userId } = useAuth();
  const router = useRouter();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [groupedExpenses, setGroupedExpenses] = useState<GroupedExpenses[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isChangingMonth, setIsChangingMonth] = useState(false);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  useEffect(() => {
    initUser();
  }, [userId]);

  useEffect(() => {
    if (dbUserId) {
      loadExpenses();
    }
  }, [dbUserId, selectedMonth]);

  const initUser = async () => {
    if (!userId) return;
    try {
      const user = await getUserByClerkId(userId);
      setDbUserId(user?.id || null);
    } catch (error) {
      console.error('Error getting user:', error);
    }
  };

  const loadExpenses = useCallback(async () => {
    if (!dbUserId) return;

    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    try {
      const data = await getExpenses(dbUserId, startDate, endDate);

      const grouped: Record<string, ExpenseWithDetails[]> = {};
      let incomeTotal = 0;
      let expenseTotal = 0;
      
      data.forEach((expense) => {
        const dateKey = expense.expense_date;
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(expense);
        if (expense.type === 'income') {
          incomeTotal += Number(expense.amount);
        } else {
          expenseTotal += Number(expense.amount);
        }
      });

      const groupedArray: GroupedExpenses[] = Object.entries(grouped)
        .map(([date, exps]) => ({
          date,
          displayDate: formatDisplayDate(date),
          expenses: exps,
          total: exps.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0),
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Batch state updates to prevent flickering
      setExpenses(data);
      setGroupedExpenses(groupedArray);
      setTotalIncome(incomeTotal);
      setTotalExpenses(expenseTotal);
    } catch (error) {
      console.error('Error loading expenses:', error);
    } finally {
      setInitialLoading(false);
      setIsChangingMonth(false);
    }
  }, [dbUserId, selectedMonth]);

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExpenses();
    setRefreshing(false);
  };

  const handleDelete = (expense: ExpenseWithDetails) => {
    const categoryName = expense.user_category?.name || expense.category?.name || 'Unknown';
    Alert.alert(
      'Delete Transaction',
      `Delete this ${categoryName} transaction of ${formatCurrency(expense.amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(expense.id);
              await loadExpenses();
            } catch (error) {
              console.error('Error deleting expense:', error);
              Alert.alert('Error', 'Failed to delete transaction');
            }
          },
        },
      ]
    );
  };

  const changeMonth = (direction: number) => {
    const newMonth = new Date(selectedMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    if (newMonth > new Date()) return;
    
    setIsChangingMonth(true);
    setSelectedMonth(newMonth);
  };

  const renderExpenseItem = ({ item }: { item: ExpenseWithDetails }) => {
    const category = item.category;
    const subcategory = item.user_category;
    const displayCategory = category?.name || 'Unknown';
    const displayColor = category?.color || Colors.textMuted;
    const isCustomCategory = category?.user_id != null;
    const iconName = isCustomCategory ? 'tag' : (CategoryIcons[category?.name || ''] || 'package');
    const isIncome = item.type === 'income';
    const displaySubtext = subcategory?.name || item.note || item.payment_method?.name || '';

    return (
      <TouchableOpacity
        style={styles.transactionItem}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.transactionIcon, { backgroundColor: displayColor + '15' }]}>
          <Feather name={iconName as any} size={16} color={displayColor} />
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionName}>{displayCategory}</Text>
          {displaySubtext ? (
            <Text style={styles.transactionSubtext} numberOfLines={1}>{displaySubtext}</Text>
          ) : null}
        </View>
        <Text style={[styles.transactionAmount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
          {isIncome ? '+' : '-'}{formatCurrency(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderDateGroup = ({ item }: { item: GroupedExpenses }) => (
    <View style={styles.dateGroup}>
      <View style={styles.dateHeader}>
        <Text style={styles.dateText}>{item.displayDate}</Text>
        <Text style={[styles.dateTotalText, item.total >= 0 ? styles.incomeAmount : styles.expenseAmount]}>
          {item.total >= 0 ? '+' : ''}{formatCurrency(item.total)}
        </Text>
      </View>
      {item.expenses.map((expense) => (
        <View key={expense.id}>
          {renderExpenseItem({ item: expense })}
        </View>
      ))}
    </View>
  );

  const monthName = selectedMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const isCurrentMonth = selectedMonth.getMonth() === new Date().getMonth() && 
                         selectedMonth.getFullYear() === new Date().getFullYear();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with gradient */}
      <LinearGradient
        colors={[Colors.goldLight, Colors.background]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Text style={styles.title}>History</Text>
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/debts')}
            style={styles.headerButton}
          >
            <Feather name="bell" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity style={styles.monthArrow} onPress={() => changeMonth(-1)}>
            <Feather name="chevron-left" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthName}</Text>
          <TouchableOpacity 
            style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]} 
            onPress={() => changeMonth(1)}
            disabled={isCurrentMonth}
          >
            <Feather name="chevron-right" size={20} color={isCurrentMonth ? Colors.textMuted : Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Summary Card */}
        {initialLoading ? (
          <SummarySkeleton />
        ) : (
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIconCircle, { backgroundColor: Colors.successLight }]}>
                <Feather name="arrow-down-left" size={16} color={Colors.success} />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Income</Text>
                <Text style={[styles.summaryValue, { color: Colors.success }]}>
                  +{formatCurrency(totalIncome)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <View style={[styles.summaryIconCircle, { backgroundColor: Colors.errorLight }]}>
                <Feather name="arrow-up-right" size={16} color={Colors.error} />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Expenses</Text>
                <Text style={[styles.summaryValue, { color: Colors.error }]}>
                  -{formatCurrency(totalExpenses)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <View style={[styles.summaryIconCircle, { backgroundColor: Colors.goldLight }]}>
                <Feather name="credit-card" size={16} color={Colors.gold} />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryLabel}>Balance</Text>
                <Text style={[styles.summaryValue, { color: (totalIncome - totalExpenses) >= 0 ? Colors.success : Colors.error }]}>
                  {(totalIncome - totalExpenses) >= 0 ? '+' : ''}{formatCurrency(totalIncome - totalExpenses)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* Transactions Header */}
      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
        <Text style={styles.transactionsCount}>
          {initialLoading ? '...' : `${expenses.length} items`}
        </Text>
      </View>

      {/* Transaction List */}
      {initialLoading ? (
        <LoadingSkeleton />
      ) : isChangingMonth ? (
        <View style={styles.listContent}>
          <LoadingSkeleton />
        </View>
      ) : groupedExpenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Feather name="inbox" size={28} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No transactions</Text>
          <Text style={styles.emptySubtext}>No transactions found for this month</Text>
        </View>
      ) : (
        <FlatList
          data={groupedExpenses}
          renderItem={renderDateGroup}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  
  // Skeleton
  skeletonContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Header with Gradient
  headerGradient: {
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerButton: {
    padding: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Month Selector
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 14,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthArrowDisabled: {
    opacity: 0.5,
  },
  monthText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    minWidth: 130,
    textAlign: 'center',
  },

  // Summary Card
  summaryCard: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryContent: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
  },

  // Transactions Header
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  transactionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  transactionsCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dateTotalText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Transaction Item
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionDetails: {
    flex: 1,
    marginLeft: 10,
  },
  transactionName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  transactionSubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  incomeAmount: {
    color: Colors.success,
  },
  expenseAmount: {
    color: Colors.error,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
