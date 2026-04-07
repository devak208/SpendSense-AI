import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, CategoryIcons } from '@/constants/Colors';
import { getMonthlyStats, getUserByClerkId, getAvailableMonths } from '@/lib/supabase';

const { width } = Dimensions.get('window');

type MonthData = {
  month: number;
  year: number;
  label: string;
  key?: string; // Added for API compatibility
  totalSpent: number;
  dailyAverage: number;
  topCategory: { name: string; color: string; total: number } | null;
  categoryBreakdown: { name: string; color: string; total: number }[];
  transactionCount: number;
  totalIncome: number;
  topIncomeCategory: { name: string; color: string; total: number } | null;
  incomeCategoryBreakdown: { name: string; color: string; total: number }[];
  incomeTransactionCount: number;
  netBalance: number;
  savingsRate: number;
};

// Skeleton Component with animation
const SkeletonBox = ({ width: w, height, style }: { width: number | string; height: number; style?: any }) => {
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
      style={[{ width: w, height, backgroundColor: Colors.border, borderRadius: 8, opacity }, style]}
    />
  );
};

// Feature Card Skeleton (matching home screen)
const FeatureCardSkeleton = () => (
  <View style={[styles.featureCard, { backgroundColor: Colors.cream }]}>
    <View style={styles.featureContent}>
      <SkeletonBox width={160} height={18} style={{ marginBottom: 8 }} />
      <SkeletonBox width={120} height={12} />
    </View>
    <View style={styles.featureDecor}>
      <SkeletonBox width={48} height={48} style={{ borderRadius: 24 }} />
    </View>
  </View>
);

// Stat Card Skeleton
const StatsCardSkeleton = () => (
  <View style={styles.incomeExpenseRow}>
    <View style={[styles.incomeCard, { backgroundColor: Colors.successLight }]}>
      <SkeletonBox width={60} height={14} style={{ marginBottom: 8 }} />
      <SkeletonBox width={90} height={22} style={{ marginBottom: 4 }} />
      <SkeletonBox width={70} height={10} />
    </View>
    <View style={[styles.incomeCard, { backgroundColor: Colors.errorLight }]}>
      <SkeletonBox width={60} height={14} style={{ marginBottom: 8 }} />
      <SkeletonBox width={90} height={22} style={{ marginBottom: 4 }} />
      <SkeletonBox width={70} height={10} />
    </View>
  </View>
);

// Net Balance Skeleton
const NetBalanceSkeleton = () => (
  <View style={[styles.netBalanceCard, { backgroundColor: Colors.border }]}>
    <View>
      <SkeletonBox width={80} height={14} style={{ marginBottom: 8 }} />
      <SkeletonBox width={120} height={24} />
    </View>
    <SkeletonBox width={60} height={50} style={{ borderRadius: 12 }} />
  </View>
);

// Chart Skeleton
const ChartSkeleton = () => (
  <View style={styles.chartCard}>
    <View style={styles.chartBars}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={styles.barWrapper}>
          <SkeletonBox width="70%" height={Math.random() * 80 + 40} style={{ marginBottom: 6 }} />
          <SkeletonBox width={25} height={10} />
        </View>
      ))}
    </View>
  </View>
);

// Category Skeleton
const CategorySkeleton = () => (
  <View style={styles.categoryList}>
    {[1, 2, 3].map((i) => (
      <View key={i} style={styles.categoryRow}>
        <SkeletonBox width={36} height={36} style={{ borderRadius: 10 }} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <SkeletonBox width="60%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonBox width="100%" height={4} />
        </View>
        <SkeletonBox width={50} height={14} />
      </View>
    ))}
  </View>
);

// Full Loading Skeleton
const SummaryLoadingSkeleton = () => (
  <>
    <FeatureCardSkeleton />
    <View style={styles.monthSelector}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthScroll}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBox key={i} width={60} height={32} style={{ borderRadius: 16, marginRight: 8 }} />
        ))}
      </ScrollView>
    </View>
    <StatsCardSkeleton />
    <NetBalanceSkeleton />
    <View style={styles.quickStatsRow}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.quickStatItem}>
          <SkeletonBox width={14} height={14} style={{ borderRadius: 4 }} />
          <SkeletonBox width={40} height={14} style={{ marginTop: 4 }} />
          <SkeletonBox width={50} height={8} style={{ marginTop: 2 }} />
        </View>
      ))}
    </View>
    <View style={styles.section}>
      <SkeletonBox width={100} height={14} style={{ marginBottom: 12 }} />
      <ChartSkeleton />
    </View>
    <View style={styles.section}>
      <SkeletonBox width={80} height={14} style={{ marginBottom: 12 }} />
      <CategorySkeleton />
    </View>
  </>
);

// Animated Bar Chart
const BarChart = ({ data, selectedIndex }: { data: MonthData[]; selectedIndex: number }) => {
  const maxValue = Math.max(...data.map(d => d.totalSpent), 1);
  const chartHeight = 120;
  const animatedHeights = useRef(data.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = data.map((item, index) => {
      const targetHeight = (item.totalSpent / maxValue) * chartHeight;
      return Animated.spring(animatedHeights[index], {
        toValue: targetHeight || 4,
        friction: 8,
        tension: 40,
        useNativeDriver: false,
      });
    });
    Animated.stagger(60, animations).start();
  }, [data]);

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {data.map((item, index) => {
          const isSelected = selectedIndex === index;
          return (
            <View key={`${item.year}-${item.month}-${index}`} style={styles.barWrapper}>
              <Text style={styles.barValue}>
                {item.totalSpent > 0 ? `₹${Math.round(item.totalSpent / 1000)}k` : '-'}
              </Text>
              <View style={[styles.barBackground, { height: chartHeight }]}>
                <Animated.View
                  style={[
                    styles.barFill,
                    {
                      height: animatedHeights[index],
                      backgroundColor: isSelected ? Colors.primary : Colors.border,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, isSelected && styles.barLabelActive]}>
                {item.label.slice(0, 3)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// Comparison Card with animation
const ComparisonCard = ({ current, previous }: { current: MonthData; previous: MonthData | null }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [current]);

  if (!previous) return null;

  const spendDiff = current.totalSpent - previous.totalSpent;
  const spendPercent = previous.totalSpent > 0 ? ((spendDiff / previous.totalSpent) * 100) : 0;
  const incomeDiff = current.totalIncome - previous.totalIncome;
  const savingsDiff = current.savingsRate - previous.savingsRate;

  const isSpendUp = spendDiff > 0;
  const isIncomeUp = incomeDiff > 0;
  const isSavingsUp = savingsDiff > 0;

  return (
    <Animated.View style={[styles.comparisonCard, { opacity: fadeAnim }]}>
      <View style={styles.comparisonHeader}>
        <Feather name="repeat" size={14} color={Colors.primary} />
        <Text style={styles.comparisonTitle}>vs {previous.label}</Text>
      </View>
      <View style={styles.comparisonGrid}>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonBadge, isSpendUp ? styles.badgeUp : styles.badgeDown]}>
            <Feather name={isSpendUp ? 'arrow-up' : 'arrow-down'} size={10} color={isSpendUp ? Colors.error : Colors.success} />
            <Text style={[styles.comparisonPercent, { color: isSpendUp ? Colors.error : Colors.success }]}>
              {Math.abs(spendPercent).toFixed(0)}%
            </Text>
          </View>
          <Text style={styles.comparisonLabel}>Spending</Text>
        </View>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonBadge, isIncomeUp ? styles.badgeDown : styles.badgeUp]}>
            <Feather name={isIncomeUp ? 'arrow-up' : 'arrow-down'} size={10} color={isIncomeUp ? Colors.success : Colors.error} />
            <Text style={[styles.comparisonPercent, { color: isIncomeUp ? Colors.success : Colors.error }]}>
              ₹{Math.abs(Math.round(incomeDiff))}
            </Text>
          </View>
          <Text style={styles.comparisonLabel}>Income</Text>
        </View>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonBadge, isSavingsUp ? styles.badgeDown : styles.badgeUp]}>
            <Feather name={isSavingsUp ? 'arrow-up' : 'arrow-down'} size={10} color={isSavingsUp ? Colors.success : Colors.error} />
            <Text style={[styles.comparisonPercent, { color: isSavingsUp ? Colors.success : Colors.error }]}>
              {Math.abs(savingsDiff).toFixed(0)}%
            </Text>
          </View>
          <Text style={styles.comparisonLabel}>Savings</Text>
        </View>
      </View>
    </Animated.View>
  );
};

export default function SummaryScreen() {
  const { userId } = useAuth();
  const now = new Date();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { initUser(); }, [userId]);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [loading]);

  const initUser = async () => {
    if (!userId) return;
    try {
      const user = await getUserByClerkId(userId);
      if (user) {
        setDbUserId(user.id);
        await loadAllMonthsStats(user.id);
      }
    } catch (error) {
      console.error('Error getting user:', error);
    }
  };

  const loadAllMonthsStats = async (userDbId: string) => {
    try {
      // Fetch available months dynamically from API
      const availableMonths = await getAvailableMonths(userDbId);
      
      // If no months, create at least current month
      const monthsList = availableMonths.length > 0 
        ? availableMonths 
        : [{ year: now.getFullYear(), month: now.getMonth() + 1, label: now.toLocaleString('default', { month: 'short' }), key: `${now.getFullYear()}-${now.getMonth() + 1}` }];
      
      const statsPromises = monthsList.map(async (m) => {
        try {
          const data = await getMonthlyStats(userDbId, m.year, m.month);
          return {
            ...m,
            totalSpent: data?.totalSpent || 0,
            dailyAverage: data?.dailyAverage || 0,
            topCategory: data?.topCategory || null,
            categoryBreakdown: data?.categoryBreakdown || [],
            transactionCount: data?.transactionCount || 0,
            totalIncome: data?.totalIncome || 0,
            topIncomeCategory: data?.topIncomeCategory || null,
            incomeCategoryBreakdown: data?.incomeCategoryBreakdown || [],
            incomeTransactionCount: data?.incomeTransactionCount || 0,
            netBalance: data?.netBalance || 0,
            savingsRate: data?.savingsRate || 0,
          } as MonthData;
        } catch {
          return { ...m, totalSpent: 0, dailyAverage: 0, topCategory: null, categoryBreakdown: [], transactionCount: 0, totalIncome: 0, topIncomeCategory: null, incomeCategoryBreakdown: [], incomeTransactionCount: 0, netBalance: 0, savingsRate: 0 } as MonthData;
        }
      });

      const allStats = await Promise.all(statsPromises);
      setMonthsData(allStats);
      setSelectedMonthIndex(allStats.length - 1);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!dbUserId) return;
    setRefreshing(true);
    await loadAllMonthsStats(dbUserId);
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const currentData = monthsData[selectedMonthIndex];
  const previousData = selectedMonthIndex > 0 ? monthsData[selectedMonthIndex - 1] : null;
  const maxCategoryTotal = currentData?.categoryBreakdown?.reduce((max, cat) => Math.max(max, cat.total), 0) || 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Monthly Summary</Text>
          <Text style={styles.subtitle}>Analyze your spending patterns</Text>
        </View>

        {loading ? (
          <SummaryLoadingSkeleton />
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Feature Card - matching home screen */}
            <LinearGradient
              colors={[Colors.surfaceElevated, Colors.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.featureCard}
            >
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>
                  <Text style={{ color: Colors.primary }}>Analyze</Text> your spending
                </Text>
                <Text style={styles.featureSubtitle}>Track trends & compare months</Text>
              </View>
              <View style={styles.featureDecor}>
                <View style={styles.decorCircle1} />
                <View style={styles.decorCircle2} />
                <View style={styles.decorIcon}>
                  <Feather name="bar-chart-2" size={24} color={Colors.primary} />
                </View>
              </View>
            </LinearGradient>

            {/* Month Selector */}
            <View style={styles.monthSelector}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthScroll}>
                {monthsData.map((m, index) => (
                  <TouchableOpacity
                    key={`${m.year}-${m.month}`}
                    style={[styles.monthChip, selectedMonthIndex === index && styles.monthChipActive]}
                    onPress={() => setSelectedMonthIndex(index)}
                  >
                    <Text style={[styles.monthChipText, selectedMonthIndex === index && styles.monthChipTextActive]}>
                      {m.label} {m.year !== now.getFullYear() ? `'${String(m.year).slice(-2)}` : ''}
                    </Text>
                    {index === monthsData.length - 1 && (
                      <View style={[
                        styles.currentBadge, 
                        selectedMonthIndex !== index && styles.currentBadgeUnselected
                      ]}>
                        <Text style={[
                          styles.currentBadgeText,
                          selectedMonthIndex !== index && styles.currentBadgeTextUnselected
                        ]}>Now</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {currentData && (currentData.transactionCount > 0 || currentData.incomeTransactionCount > 0) ? (
              <>
                {/* Income vs Expenses */}
                <View style={styles.incomeExpenseRow}>
                  <View style={[styles.incomeCard, { backgroundColor: Colors.successLight }]}>
                    <View style={styles.cardIconRow}>
                      <View style={[styles.cardIcon, { backgroundColor: Colors.success + '30' }]}>
                        <Feather name="arrow-down-left" size={14} color={Colors.success} />
                      </View>
                      <Text style={styles.cardLabel}>Income</Text>
                    </View>
                    <Text style={[styles.cardValue, { color: Colors.success }]}>
                      +{formatCurrency(currentData.totalIncome)}
                    </Text>
                    <Text style={styles.cardMeta}>{currentData.incomeTransactionCount} transactions</Text>
                  </View>
                  <View style={[styles.incomeCard, { backgroundColor: Colors.errorLight }]}>
                    <View style={styles.cardIconRow}>
                      <View style={[styles.cardIcon, { backgroundColor: Colors.error + '30' }]}>
                        <Feather name="arrow-up-right" size={14} color={Colors.error} />
                      </View>
                      <Text style={styles.cardLabel}>Expenses</Text>
                    </View>
                    <Text style={[styles.cardValue, { color: Colors.error }]}>
                      -{formatCurrency(currentData.totalSpent)}
                    </Text>
                    <Text style={styles.cardMeta}>{currentData.transactionCount} transactions</Text>
                  </View>
                </View>

                {/* Net Balance Card */}
                <View style={[
                  styles.netBalanceCard,
                  { backgroundColor: currentData.netBalance >= 0 ? Colors.successLight : Colors.errorLight }
                ]}>
                  <View style={styles.netBalanceLeft}>
                    <View style={styles.netBalanceHeader}>
                      <Feather 
                        name={currentData.netBalance >= 0 ? 'trending-up' : 'trending-down'} 
                        size={16} 
                        color={currentData.netBalance >= 0 ? Colors.success : Colors.error} 
                      />
                      <Text style={styles.netBalanceLabel}>Net Balance</Text>
                    </View>
                    <Text style={[
                      styles.netBalanceValue,
                      { color: currentData.netBalance >= 0 ? Colors.success : Colors.error }
                    ]}>
                      {currentData.netBalance >= 0 ? '+' : '-'}{formatCurrency(currentData.netBalance)}
                    </Text>
                  </View>
                  <View style={styles.savingsRateBox}>
                    <Text style={[
                      styles.savingsRateValue,
                      { color: currentData.savingsRate >= 0 ? Colors.success : Colors.error }
                    ]}>
                      {currentData.savingsRate}%
                    </Text>
                    <Text style={styles.savingsRateLabel}>Saved</Text>
                  </View>
                </View>

                {/* Quick Stats */}
                <View style={styles.quickStatsRow}>
                  <View style={styles.quickStatItem}>
                    <Feather name="calendar" size={14} color={Colors.gold} />
                    <Text style={styles.quickStatValue}>{formatCurrency(currentData.dailyAverage)}</Text>
                    <Text style={styles.quickStatLabel}>Daily Avg</Text>
                  </View>
                  <View style={styles.quickStatDivider} />
                  <View style={styles.quickStatItem}>
                    <Feather name="hash" size={14} color={Colors.primary} />
                    <Text style={styles.quickStatValue}>{currentData.transactionCount + currentData.incomeTransactionCount}</Text>
                    <Text style={styles.quickStatLabel}>Total Txns</Text>
                  </View>
                  <View style={styles.quickStatDivider} />
                  <View style={styles.quickStatItem}>
                    <Feather name="pie-chart" size={14} color={Colors.gold} />
                    <Text style={styles.quickStatValue}>{currentData.categoryBreakdown.length}</Text>
                    <Text style={styles.quickStatLabel}>Categories</Text>
                  </View>
                </View>

                {/* Comparison */}
                {previousData && <ComparisonCard current={currentData} previous={previousData} />}

                {/* Chart */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>6-Month Trend</Text>
                    <Feather name="trending-up" size={14} color={Colors.textSecondary} />
                  </View>
                  <View style={styles.chartCard}>
                    <BarChart data={monthsData} selectedIndex={selectedMonthIndex} />
                  </View>
                </View>

                {/* Top Category */}
                {currentData.topCategory && (
                  <View style={styles.topCategoryCard}>
                    <View style={styles.topCategoryHeader}>
                      <Feather name="award" size={14} color={Colors.gold} />
                      <Text style={styles.topCategoryTitle}>Top Category</Text>
                    </View>
                    <View style={styles.topCategoryContent}>
                      <View style={[styles.topCategoryIcon, { backgroundColor: currentData.topCategory.color + '20' }]}>
                        <Feather name={CategoryIcons[currentData.topCategory.name] as any || 'package'} size={20} color={currentData.topCategory.color} />
                      </View>
                      <View style={styles.topCategoryInfo}>
                        <Text style={styles.topCategoryName}>{currentData.topCategory.name}</Text>
                        <Text style={styles.topCategoryAmount}>{formatCurrency(currentData.topCategory.total)}</Text>
                      </View>
                      <View style={styles.topCategoryPercent}>
                        <Text style={styles.percentValue}>
                          {Math.round((currentData.topCategory.total / currentData.totalSpent) * 100)}%
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Category Breakdown */}
                {currentData.categoryBreakdown.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Breakdown</Text>
                      <View style={styles.categoryCount}>
                        <Text style={styles.categoryCountText}>{currentData.categoryBreakdown.length} categories</Text>
                      </View>
                    </View>
                    <View style={styles.categoryList}>
                      {currentData.categoryBreakdown.sort((a, b) => b.total - a.total).map((cat) => {
                        const percentage = Math.round((cat.total / (currentData.totalSpent || 1)) * 100);
                        const barWidth = (cat.total / maxCategoryTotal) * 100;
                        return (
                          <View key={cat.name} style={styles.categoryRow}>
                            <View style={[styles.categoryIcon, { backgroundColor: cat.color + '15' }]}>
                              <Feather name={CategoryIcons[cat.name] as any || 'package'} size={14} color={cat.color} />
                            </View>
                            <View style={styles.categoryInfo}>
                              <View style={styles.categoryTop}>
                                <Text style={styles.categoryName}>{cat.name}</Text>
                                <Text style={styles.categoryAmount}>{formatCurrency(cat.total)}</Text>
                              </View>
                              <View style={styles.categoryBottom}>
                                <View style={styles.progressBar}>
                                  <View style={[styles.progressFill, { width: `${barWidth}%`, backgroundColor: cat.color }]} />
                                </View>
                                <Text style={styles.categoryPercent}>{percentage}%</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Feather name="bar-chart-2" size={32} color={Colors.textSecondary} />
                </View>
                <Text style={styles.emptyText}>No data for {currentData?.label || 'this month'}</Text>
                <Text style={styles.emptySubtext}>Add expenses to see your summary</Text>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // Header - matching home
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  // Feature Card - matching home exactly
  featureCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  featureContent: { flex: 1 },
  featureTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  featureSubtitle: { fontSize: 12, color: Colors.textSecondary },
  featureDecor: { width: 70, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  decorCircle1: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primaryMuted,
    opacity: 0.5,
    top: -10,
    right: -10,
  },
  decorCircle2: {
    position: 'absolute',
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: Colors.goldLight,
    opacity: 0.6,
    bottom: -5,
    right: 20,
  },
  decorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  // Month Selector
  monthSelector: { marginTop: 16 },
  monthScroll: { paddingHorizontal: 20, gap: 8 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthChipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  monthChipTextActive: { color: '#FFF' },
  currentBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  currentBadgeText: { fontSize: 9, fontWeight: '600', color: '#FFF' },
  currentBadgeUnselected: { backgroundColor: Colors.primary },
  currentBadgeTextUnselected: { color: '#FFF' },

  // Income/Expense Cards
  incomeExpenseRow: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 16, gap: 12 },
  incomeCard: { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardIcon: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  cardLabel: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  cardValue: { fontSize: 18, fontWeight: '700' },
  cardMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },

  // Net Balance Card
  netBalanceCard: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  netBalanceLeft: { flex: 1 },
  netBalanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  netBalanceLabel: { fontSize: 12, fontWeight: '500', color: Colors.textSecondary },
  netBalanceValue: { fontSize: 22, fontWeight: '700' },
  savingsRateBox: { alignItems: 'center', backgroundColor: Colors.card, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  savingsRateValue: { fontSize: 16, fontWeight: '700' },
  savingsRateLabel: { fontSize: 9, color: Colors.textMuted },

  // Quick Stats
  quickStatsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickStatItem: { flex: 1, alignItems: 'center' },
  quickStatValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  quickStatLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  quickStatDivider: { width: 1, backgroundColor: Colors.border },

  // Comparison Card
  comparisonCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  comparisonHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  comparisonTitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  comparisonGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  comparisonItem: { alignItems: 'center', flex: 1 },
  comparisonBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
  badgeUp: { backgroundColor: Colors.errorLight },
  badgeDown: { backgroundColor: Colors.successLight },
  comparisonPercent: { fontSize: 12, fontWeight: '700' },
  comparisonLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },

  // Section
  section: { marginTop: 20, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  categoryCount: { backgroundColor: Colors.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryCountText: { fontSize: 10, color: Colors.textSecondary },

  // Chart
  chartCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  chartContainer: { alignItems: 'center' },
  chartBars: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'flex-end' },
  barWrapper: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, color: Colors.textMuted, fontWeight: '500' },
  barBackground: { width: '70%', backgroundColor: Colors.background, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  barLabelActive: { color: Colors.primary, fontWeight: '600' },

  // Top Category
  topCategoryCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.goldLight,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.gold + '30',
  },
  topCategoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  topCategoryTitle: { fontSize: 11, fontWeight: '600', color: Colors.gold },
  topCategoryContent: { flexDirection: 'row', alignItems: 'center' },
  topCategoryIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  topCategoryInfo: { flex: 1, marginLeft: 12 },
  topCategoryName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  topCategoryAmount: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  topCategoryPercent: { alignItems: 'center' },
  percentValue: { fontSize: 18, fontWeight: '700', color: Colors.gold },

  // Category List
  categoryList: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  categoryRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  categoryIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  categoryInfo: { flex: 1, marginLeft: 12 },
  categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryName: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  categoryAmount: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  categoryBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  progressBar: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  categoryPercent: { fontSize: 10, color: Colors.textMuted, fontWeight: '500', width: 30, textAlign: 'right' },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  emptySubtext: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
});
