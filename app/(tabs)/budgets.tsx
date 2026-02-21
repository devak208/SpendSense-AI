import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { Colors } from '@/constants/Colors';
import {
  getUserPreferences,
  updateUserPreferences,
  getBudgets,
  saveBudget,
  deleteBudget,
  getBudgetInsights,
  getUserByClerkId,
  getExpenses,
  getCategories,
  Budget,
  UserPreferences,
  Category,
  ExpenseWithDetails
} from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';

export default function BudgetsScreen() {
  const { userId: clerkId } = useAuth();
  
  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState<'daily' | 'savings' | 'category' | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);

  // Aggregate Spending
  const [todaySpent, setTodaySpent] = useState(0);
  const [monthTotals, setMonthTotals] = useState<Record<string, number>>({});
  const [monthTotalExpense, setMonthTotalExpense] = useState(0);

  useEffect(() => {
    init();
  }, [clerkId]);

  const init = async () => {
    if (!clerkId) return;
    try {
      const user = await getUserByClerkId(clerkId);
      if (user) {
        setDbUserId(user.id);
        await loadData(user.id);
      }
    } catch (e) {
      console.error('Error initializing user:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async (uid: string) => {
    try {
      const [prefs, userBudgets, cats] = await Promise.all([
        getUserPreferences(uid),
        getBudgets(uid),
        getCategories()
      ]);
      setPreferences(prefs);
      setBudgets(userBudgets);
      setCategories(cats);

      // Load expenses for this month to calculate progress
      const now = new Date();
      const todayString = now.toISOString().split('T')[0];
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      
      const allExpenses = await getExpenses(uid, firstDay);
      setExpenses(allExpenses);

      let todayTotal = 0;
      let mTotal = 0;
      const catTotals: Record<string, number> = {};

      allExpenses.forEach(exp => {
        if (exp.type === 'expense') {
          mTotal += exp.amount;
          if (exp.expense_date.startsWith(todayString)) {
            todayTotal += exp.amount;
          }
          if (exp.category_id) {
            catTotals[exp.category_id] = (catTotals[exp.category_id] || 0) + exp.amount;
          }
        }
      });

      setTodaySpent(todayTotal);
      setMonthTotalExpense(mTotal);
      setMonthTotals(catTotals);

      fetchInsights(uid);
    } catch (error) {
      console.error('Error loading budget data:', error);
    }
  };

  const fetchInsights = async (uid: string) => {
    setLoadingInsights(true);
    try {
      const aiInsights = await getBudgetInsights(uid);
      setInsights(aiInsights);
    } catch (e) {
      console.log('Error fetching insights:', e);
    } finally {
      setLoadingInsights(false);
    }
  };

  const onRefresh = async () => {
    if (!dbUserId) return;
    setRefreshing(true);
    await loadData(dbUserId);
    setRefreshing(false);
  };

  const handleSave = async () => {
    if (!dbUserId || !editMode || !editAmount) return;
    const amount = parseFloat(editAmount);
    
    try {
      if (editMode === 'daily') {
        await updateUserPreferences({ user_id: dbUserId, daily_limit: amount });
      } else if (editMode === 'savings') {
        await updateUserPreferences({ user_id: dbUserId, savings_goal: amount });
      } else if (editMode === 'category' && editCategoryId) {
        // Find existing budget
        const existing = budgets.find(b => b.category_id === editCategoryId);
        await saveBudget({
          id: existing?.id,
          user_id: dbUserId,
          category_id: editCategoryId,
          amount
        });
      }
      setModalVisible(false);
      setEditAmount('');
      setEditCategoryId(null);
      loadData(dbUserId);
    } catch (e) {
      console.error('Error saving budget:', e);
    }
  };

  const openEditor = (mode: 'daily' | 'savings' | 'category', currentAmount: string, catId?: string) => {
    setEditMode(mode);
    setEditAmount(currentAmount);
    if (catId) setEditCategoryId(catId);
    setModalVisible(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

  const renderProgressBar = (spent: number, limit: number, color: string) => {
    const percentage = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    const isExceeded = spent > limit;
    const barColor = isExceeded ? Colors.error : color;
    
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <Animated.View style={[styles.progressBarFill, { width: `${percentage}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.progressText, isExceeded && { color: Colors.error }]}>
          {formatCurrency(spent)} / {formatCurrency(limit)} {isExceeded ? '(Exceeded!)' : ''}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Budgets & Goals</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* AI Insights Card */}
        <LinearGradient
          colors={[Colors.primaryMuted, Colors.background]}
          style={styles.aiCard}
        >
          <View style={styles.aiTitleRow}>
            <Feather name="cpu" size={18} color={Colors.primary} />
            <Text style={styles.aiTitle}>AI Spending Insights</Text>
          </View>
          {loadingInsights ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 10 }} />
          ) : (
            <Text style={styles.aiText}>{insights || "Set some budgets and log expenses to get AI insights!"}</Text>
          )}
        </LinearGradient>

        <Text style={styles.sectionTitle}>Overall Limits</Text>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Daily Limit</Text>
            <TouchableOpacity onPress={() => openEditor('daily', preferences?.daily_limit?.toString() || '')}>
              <Feather name="edit-2" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          {preferences?.daily_limit ? (
            renderProgressBar(Math.round(todaySpent), preferences.daily_limit, Colors.secondary)
          ) : (
            <Text style={styles.emptyText}>No daily limit set. Tap edit to set one.</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Monthly Savings Goal</Text>
            <TouchableOpacity onPress={() => openEditor('savings', preferences?.savings_goal?.toString() || '')}>
              <Feather name="edit-2" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          {preferences?.savings_goal ? (
            <View>
                <Text style={styles.savingsSubtext}>Target: {formatCurrency(preferences.savings_goal)}</Text>
                {/* Visualizing savings progress is tricky since it's Income - Expense. We'll just show the goal for now. */}
            </View>
          ) : (
            <Text style={styles.emptyText}>No savings goal set.</Text>
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Category Budgets</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => openEditor('category', '')}>
            <Feather name="plus" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        {budgets.length === 0 ? (
          <Text style={[styles.emptyText, { marginHorizontal: 20 }]}>You haven't set any category budgets yet.</Text>
        ) : (
          budgets.map(b => (
            <View key={b.id} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{b.category?.name || 'Category'}</Text>
                <View style={{flexDirection: 'row', gap: 15}}>
                  <TouchableOpacity onPress={() => {
                     deleteBudget(b.id).then(() => { if(dbUserId) loadData(dbUserId) });
                  }}>
                    <Feather name="trash-2" size={16} color={Colors.error} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEditor('category', b.amount.toString(), b.category_id!)}>
                    <Feather name="edit-2" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {renderProgressBar(monthTotals[b.category_id!] || 0, b.amount, Colors.primary)}
            </View>
          ))
        )}

      </ScrollView>

      {/* Editor Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editMode === 'daily' ? 'Edit Daily Limit' : editMode === 'savings' ? 'Edit Savings Goal' : 'Edit Category Budget'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Feather name="x" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editMode === 'category' && !editCategoryId && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroller}>
                 {categories.map(c => (
                   <TouchableOpacity 
                     key={c.id} 
                     style={[styles.categoryPill, editCategoryId === c.id && { backgroundColor: Colors.primary }]}
                     onPress={() => setEditCategoryId(c.id)}
                   >
                     <Text style={[styles.categoryPillText, editCategoryId === c.id && { color: '#FFF' }]}>{c.name}</Text>
                   </TouchableOpacity>
                 ))}
              </ScrollView>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="e.g. 2000"
                placeholderTextColor={Colors.border}
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Budget</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// Ensure these imports are available from react-native (Animated is needed)
import { Animated } from 'react-native';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  header: { padding: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  scrollContent: { paddingBottom: 100 },
  
  aiCard: { margin: 20, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  aiTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  aiTitle: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  aiText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  sectionTitle: { fontSize: 18, fontWeight: '700', marginHorizontal: 20, marginTop: 20, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 },
  
  addBtn: { backgroundColor: Colors.primary, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 10 },

  card: { backgroundColor: Colors.card, marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  savingsSubtext: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },

  progressContainer: { marginTop: 5 },
  progressBarBackground: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', fontWeight: '500' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  closeButton: { padding: 4 },
  
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 16, color: Colors.textPrimary },
  
  saveButton: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

  categoryScroller: { marginBottom: 20, flexGrow: 0 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  categoryPillText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' }
});
