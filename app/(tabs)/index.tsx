import { useAuth, useUser } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, CategoryIcons } from '@/constants/Colors';
import {
  getExpenses,
  getMonthlyStats,
  getUserByClerkId,
  createUser,
  ExpenseWithDetails,
} from '@/lib/supabase';

// Skeleton Loading Component
const SkeletonBox = ({ width, height, style }: { width: number | string; height: number; style?: any }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

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

// Skeleton for Feature Card
const FeatureCardSkeleton = () => (
  <View style={[styles.featureCard, { backgroundColor: Colors.cream }]}>
    <View style={styles.featureContent}>
      <SkeletonBox width={160} height={18} style={{ marginBottom: 8 }} />
      <SkeletonBox width={120} height={12} style={{ marginBottom: 14 }} />
      <SkeletonBox width={100} height={32} style={{ borderRadius: 16 }} />
    </View>
    <View style={styles.featureDecor}>
      <SkeletonBox width={48} height={48} style={{ borderRadius: 24 }} />
    </View>
  </View>
);

// Skeleton for Wallet Card
const WalletCardSkeleton = () => (
  <View style={styles.walletCard}>
    <View style={styles.walletHeader}>
      <SkeletonBox width={28} height={28} style={{ borderRadius: 14, marginRight: 8 }} />
      <SkeletonBox width={60} height={12} />
    </View>
    <SkeletonBox width={80} height={10} style={{ marginBottom: 6 }} />
    <SkeletonBox width={140} height={28} style={{ marginBottom: 16 }} />
    <View style={[styles.walletStats, { borderTopWidth: 0, paddingTop: 14 }]}>
      <View style={styles.walletStatItem}>
        <SkeletonBox width={32} height={32} style={{ borderRadius: 16 }} />
        <View style={{ marginLeft: 8 }}>
          <SkeletonBox width={40} height={10} style={{ marginBottom: 4 }} />
          <SkeletonBox width={60} height={14} />
        </View>
      </View>
      <View style={styles.walletDivider} />
      <View style={styles.walletStatItem}>
        <SkeletonBox width={32} height={32} style={{ borderRadius: 16 }} />
        <View style={{ marginLeft: 8 }}>
          <SkeletonBox width={50} height={10} style={{ marginBottom: 4 }} />
          <SkeletonBox width={60} height={14} />
        </View>
      </View>
    </View>
  </View>
);

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

// Full Home Loading Skeleton
const HomeLoadingSkeleton = () => (
  <>
    <FeatureCardSkeleton />
    <View style={{ marginTop: 16 }}>
      <WalletCardSkeleton />
    </View>
    <View style={styles.quickActionsSection}>
      <View style={styles.quickActionsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.quickActionItem}>
            <SkeletonBox width={48} height={48} style={{ borderRadius: 14, marginBottom: 6 }} />
            <SkeletonBox width={40} height={10} />
          </View>
        ))}
      </View>
    </View>
    <View style={{ marginHorizontal: 20, marginTop: 20 }}>
      <SkeletonBox width="100%" height={48} style={{ borderRadius: 10 }} />
    </View>
    <View style={[styles.section, { marginTop: 24 }]}>
      <View style={styles.sectionHeader}>
        <SkeletonBox width={130} height={16} />
        <SkeletonBox width={50} height={14} />
      </View>
      {[1, 2, 3].map((i) => (
        <TransactionSkeleton key={i} />
      ))}
    </View>
  </>
);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
            <Feather name="bell" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <HomeLoadingSkeleton />
        ) : (
          <>
            {/* Feature Card */}
            <LinearGradient
              colors={[Colors.cream, Colors.featureEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.featureCard}
            >
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>
                  <Text style={{ color: Colors.primary }}>Track</Text> your expenses
                </Text>
                <Text style={styles.featureSubtitle}>Manage your finances smartly</Text>
                <TouchableOpacity 
                  style={styles.featureButton}
                  onPress={() => router.push('/(tabs)/add-expense')}
                >
                  <Text style={styles.featureButtonText}>Add expense  »</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.featureDecor}>
                <View style={styles.decorCircle1} />
                <View style={styles.decorCircle2} />
                <View style={styles.walletIcon}>
                  <Feather name="credit-card" size={28} color={Colors.primary} />
                </View>
              </View>
            </LinearGradient>

            {/* Wallet Stats Card */}
            <View style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <View style={styles.walletIconContainer}>
                  <Feather name="credit-card" size={16} color={Colors.gold} />
                </View>
                <Text style={styles.walletTitle}>My Wallet</Text>
              </View>
              
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceAmount, (stats?.balance || 0) < 0 && styles.negativeBalance]}>
                  {(stats?.balance || 0) >= 0 ? '' : '-'}{formatCurrency(stats?.balance || 0)}
                </Text>
                <Image 
                  source={require('@/assets/images/Untitled design.gif')} 
                  style={styles.balanceGif}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.walletStats}>
                <View style={styles.walletStatItem}>
                  <View style={[styles.statIconCircle, { backgroundColor: Colors.successLight }]}>
                    <Feather name="arrow-down-left" size={14} color={Colors.success} />
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
                    <Feather name="arrow-up-right" size={14} color={Colors.error} />
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
                  <View style={styles.quickActionIcon}>
                    <Feather name="plus" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.quickActionText}>Add{'\n'}Expense</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/expenses')}>
                  <View style={styles.quickActionIcon}>
                    <Feather name="clock" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.quickActionText}>View{'\n'}History</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/summary')}>
                  <View style={styles.quickActionIcon}>
                    <Feather name="pie-chart" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.quickActionText}>Monthly{'\n'}Summary</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/debts')}>
                  <View style={styles.quickActionIcon}>
                    <Feather name="users" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.quickActionText}>Debts &{'\n'}Bills</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Add Button */}
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => router.push('/(tabs)/add-expense')}
              activeOpacity={0.8}
            >
              <Feather name="plus-circle" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Add new expense</Text>
              <Text style={styles.buttonChevron}>»</Text>
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
                    <Feather name="inbox" size={28} color={Colors.textMuted} />
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
                          <Feather name={iconName as any} size={16} color={displayColor} />
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  notificationBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Feature Card
  featureCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  featureSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  featureButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.textPrimary,
  },
  featureButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  featureDecor: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  decorCircle1: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primaryMuted,
    opacity: 0.5,
    top: -10,
    right: -10,
  },
  decorCircle2: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.goldLight,
    opacity: 0.6,
    bottom: 0,
    right: 20,
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // Wallet Card
  walletCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  walletIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.goldLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  walletTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  balanceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    // marginBottom removed to fix alignment with GIF
  },
  negativeBalance: {
    color: Colors.error,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Align GIF to the far right
    marginBottom: 16,
    // gap removed as space-between handles it
  },
  balanceGif: {
    width: 100, // Increased size as requested
    height: 100,
  },
  walletStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  walletStatItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  walletDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
    marginHorizontal: 10,
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionItem: {
    alignItems: 'center',
    width: '23%',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.primary + '15',
  },
  quickActionText: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 13,
    fontWeight: '500',
  },

  // Primary Button
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonChevron: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 2,
  },

  // Section
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  seeAllText: {
    fontSize: 13,
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  transactionDate: {
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
