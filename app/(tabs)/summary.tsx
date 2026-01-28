import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, CategoryIcons } from '@/constants/Colors';
import { getMonthlyStats, getUserByClerkId } from '@/lib/supabase';

const { width } = Dimensions.get('window');
const BAR_WIDTH = (width - 80) / 7;

export default function SummaryScreen() {
  const { userId } = useAuth();
  const now = new Date();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalSpent: number;
    dailyAverage: number;
    topCategory: { name: string; color: string; total: number } | null;
    categoryBreakdown: { name: string; color: string; total: number }[];
    transactionCount: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    initUser();
  }, [userId]);

  const initUser = async () => {
    if (!userId) return;
    try {
      const user = await getUserByClerkId(userId);
      if (user) {
        setDbUserId(user.id);
        await loadStats(user.id);
      }
    } catch (error) {
      console.error('Error getting user:', error);
    }
  };

  const loadStats = async (userDbId: string) => {
    try {
      const data = await getMonthlyStats(userDbId, now.getFullYear(), now.getMonth() + 1);
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!dbUserId) return;
    setRefreshing(true);
    await loadStats(dbUserId);
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0,  maximumFractionDigits: 0 })}`;
  };

  const maxCategoryTotal = stats?.categoryBreakdown.reduce(
    (max, cat) => Math.max(max, cat.total),
    0
  ) || 1;

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Monthly Summary</Text>
          <Text style={styles.subtitle}>{currentMonth}</Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather name="dollar-sign" size={24} color={Colors.primary} />
            <Text style={styles.statValue}>{formatCurrency(stats?.totalSpent || 0)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="trending-up" size={24} color={Colors.warning} />
            <Text style={styles.statValue}>{formatCurrency(stats?.dailyAverage || 0)}</Text>
            <Text style={styles.statLabel}>Daily Average</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather name="hash" size={24} color={Colors.success} />
            <Text style={styles.statValue}>{stats?.transactionCount || 0}</Text>
            <Text style={styles.statLabel}>Transactions</Text>
          </View>
          <View style={styles.statCard}>
            {stats?.topCategory ? (
              <>
                <View style={[styles.topCategoryIcon, { backgroundColor: stats.topCategory.color + '20' }]}>
                  <Feather
                    name={CategoryIcons[stats.topCategory.name] as any || 'package'}
                    size={20}
                    color={stats.topCategory.color}
                  />
                </View>
                <Text style={styles.statValue}>{stats.topCategory.name}</Text>
                <Text style={styles.statLabel}>Top Category</Text>
              </>
            ) : (
              <>
                <Feather name="pie-chart" size={24} color={Colors.textSecondary} />
                <Text style={styles.statValue}>-</Text>
                <Text style={styles.statLabel}>Top Category</Text>
              </>
            )}
          </View>
        </View>

        {/* Category Breakdown */}
        {stats?.categoryBreakdown && stats.categoryBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending by Category</Text>
            <View style={styles.categoryList}>
              {stats.categoryBreakdown
                .sort((a, b) => b.total - a.total)
                .map((cat) => {
                  const percentage = Math.round((cat.total / (stats.totalSpent || 1)) * 100);
                  const barWidth = (cat.total / maxCategoryTotal) * 100;

                  return (
                    <View key={cat.name} style={styles.categoryRow}>
                      <View style={styles.categoryInfo}>
                        <View style={[styles.categoryIcon, { backgroundColor: cat.color + '20' }]}>
                          <Feather
                            name={CategoryIcons[cat.name] as any || 'package'}
                            size={18}
                            color={cat.color}
                          />
                        </View>
                        <View style={styles.categoryDetails}>
                          <Text style={styles.categoryName}>{cat.name}</Text>
                          <Text style={styles.categoryPercent}>{percentage}%</Text>
                        </View>
                      </View>
                      <View style={styles.barContainer}>
                        <View
                          style={[
                            styles.bar,
                            { width: `${barWidth}%`, backgroundColor: cat.color },
                          ]}
                        />
                      </View>
                      <Text style={styles.categoryAmount}>{formatCurrency(cat.total)}</Text>
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* Empty State */}
        {(!stats || stats.transactionCount === 0) && (
          <View style={styles.emptyState}>
            <Feather name="bar-chart-2" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No data to show yet</Text>
            <Text style={styles.emptySubtext}>Add some expenses to see your summary</Text>
          </View>
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
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  topCategoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  categoryList: {
    gap: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 110,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryDetails: {
    marginLeft: 10,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  categoryPercent: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.card,
    borderRadius: 4,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    width: 80,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
});
