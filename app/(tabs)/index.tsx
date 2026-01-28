import { useAuth, useUser } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, CategoryIcons } from '@/constants/Colors';
import {
  getExpenses,
  getMonthlyStats,
  getUserByClerkId,
  createUser,
  ExpenseWithDetails,
} from '@/lib/supabase';

export default function HomeScreen() {
  const { userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<ExpenseWithDetails[]>([]);
  const [stats, setStats] = useState<{
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    topCategory: { name: string; color: string; total: number } | null;
    categoryBreakdown: { name: string; color: string; total: number }[];
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    initUser();
  }, [userId]);

  const initUser = async () => {
    if (!userId) return;

    try {
      let dbUser = await getUserByClerkId(userId);

      if (!dbUser) {
        dbUser = await createUser({
          clerk_id: userId,
          email: user?.emailAddresses[0]?.emailAddress,
          name: user?.firstName || undefined,
        });
      }

      setDbUserId(dbUser.id);
      await loadData(dbUser.id);
    } catch (error) {
      console.error('Error initializing user:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async (userDbId: string) => {
    try {
      const [expenses, monthStats] = await Promise.all([
        getExpenses(userDbId),
        getMonthlyStats(userDbId, now.getFullYear(), now.getMonth() + 1),
      ]);

      setRecentExpenses(expenses.slice(0, 5));
      
      const totalIncome = expenses
        .filter(e => e.type === 'income')
        .reduce((sum, e) => sum + e.amount, 0);
      const totalExpenses = expenses
        .filter(e => e.type === 'expense' || !e.type)
        .reduce((sum, e) => sum + e.amount, 0);
      
      setStats({
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
        topCategory: monthStats?.topCategory || null,
        categoryBreakdown: monthStats?.categoryBreakdown || [],
      });
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const onRefresh = async () => {
    if (!dbUserId) return;
    setRefreshing(true);
    await loadData(dbUserId);
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.firstName || 'there'}</Text>
            <Text style={styles.subtitle}>{currentMonth}</Text>
          </View>
          <TouchableOpacity style={styles.notificationBtn} onPress={() => router.push('/(tabs)/debts')}>
            <Feather name="bell" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Wallet Card */}
        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.walletIconContainer}>
              <Feather name="credit-card" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.walletTitle}>My Wallet</Text>
          </View>
          
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={[styles.balanceAmount, (stats?.balance || 0) < 0 && styles.negativeBalance]}>
            {(stats?.balance || 0) >= 0 ? '' : '-'}{formatCurrency(stats?.balance || 0)}
          </Text>

          <View style={styles.walletStats}>
            <View style={styles.walletStatItem}>
              <View style={[styles.statIconCircle, { backgroundColor: Colors.successLight }]}>
                <Feather name="arrow-down-left" size={16} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.statLabel}>Income</Text>
                <Text style={[styles.statValue, { color: Colors.success }]}>
                  +{formatCurrency(stats?.totalIncome || 0)}
                </Text>
              </View>
            </View>
            
            <View style={styles.walletDivider} />
            
            <View style={styles.walletStatItem}>
              <View style={[styles.statIconCircle, { backgroundColor: Colors.errorLight }]}>
                <Feather name="arrow-up-right" size={16} color={Colors.error} />
              </View>
              <View>
                <Text style={styles.statLabel}>Expenses</Text>
                <Text style={[styles.statValue, { color: Colors.error }]}>
                  -{formatCurrency(stats?.totalExpenses || 0)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/add-expense')}>
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.primaryMuted }]}>
                <Feather name="plus" size={22} color={Colors.primary} />
              </View>
              <Text style={styles.quickActionText}>Add{'\n'}Expense</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/expenses')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E5' }]}>
                <Feather name="list" size={22} color="#FF9800" />
              </View>
              <Text style={styles.quickActionText}>View{'\n'}History</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/summary')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#F3E5F5' }]}>
                <Feather name="pie-chart" size={22} color={Colors.accentPurple} />
              </View>
              <Text style={styles.quickActionText}>Monthly{'\n'}Summary</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/debts')}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Feather name="users" size={22} color="#2196F3" />
              </View>
              <Text style={styles.quickActionText}>Debts &{'\n'}Bills</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add Expense Button - Navi style */}
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => router.push('/(tabs)/add-expense')}
        >
          <Feather name="plus-circle" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Add new expense</Text>
          <Feather name="chevron-right" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent transactions</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentExpenses.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Feather name="inbox" size={32} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Add your first expense to get started</Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {recentExpenses.map((expense) => {
                const category = expense.category;
                const displayCategory = category?.name || 'Unknown';
                const displayColor = category?.color || Colors.textMuted;
                const isCustomCategory = category?.user_id != null;
                const iconName = isCustomCategory ? 'tag' : (CategoryIcons[category?.name || ''] || 'package');
                const isIncome = expense.type === 'income';

                return (
                  <View key={expense.id} style={styles.transactionItem}>
                    <View style={[styles.transactionIcon, { backgroundColor: displayColor + '15' }]}>
                      <Feather name={iconName as any} size={18} color={displayColor} />
                    </View>
                    <View style={styles.transactionDetails}>
                      <Text style={styles.transactionName}>{displayCategory}</Text>
                      <Text style={styles.transactionDate}>{formatDate(expense.expense_date)}</Text>
                    </View>
                    <Text style={[styles.transactionAmount, isIncome ? styles.incomeAmount : styles.expenseAmount]}>
                      {isIncome ? '+' : '-'}{formatCurrency(expense.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Wallet Card
  walletCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  walletTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  balanceLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  negativeBalance: {
    color: Colors.error,
  },
  walletStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  walletStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  walletDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    alignItems: 'center',
    width: '22%',
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Primary Button
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Section
  section: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  seeAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },

  // Transactions
  transactionsList: {
    gap: 0,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transactionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionDetails: {
    flex: 1,
    marginLeft: 12,
  },
  transactionName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  transactionDate: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '600',
  },
  incomeAmount: {
    color: Colors.success,
  },
  expenseAmount: {
    color: Colors.textPrimary,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
