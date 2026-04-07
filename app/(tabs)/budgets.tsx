import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
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
  getUserCategories,
  Budget,
  UserPreferences,
  Category,
  UserCategory,
  ExpenseWithDetails,
} from '@/lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';

// A unified item that can represent either a system Category or a UserCategory
interface PickerItem {
  id: string;
  name: string;
  color: string;
  icon: string;
  isUserCategory: boolean;        // true = UserCategory (user_category_id), false = system (category_id)
  parentName?: string;            // for subcategories — the parent's name
  isSubcategory: boolean;
}

export default function BudgetsScreen() {
  const { userId: clerkId } = useAuth();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);

  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // All categories merged for the picker
  const [pickerItems, setPickerItems] = useState<PickerItem[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editMode, setEditMode] = useState<'daily' | 'savings' | 'category' | null>(null);
  const [editAmount, setEditAmount] = useState('');
  // Which picker item is selected
  const [selectedItem, setSelectedItem] = useState<PickerItem | null>(null);
  // Step inside the category modal: 'pick' = choosing category, 'amount' = entering amount
  const [categoryStep, setCategoryStep] = useState<'pick' | 'amount'>('pick');

  // Aggregate Spending
  const [todaySpent, setTodaySpent] = useState(0);
  const [monthTotals, setMonthTotals] = useState<Record<string, number>>({});

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
      const [prefs, userBudgets, sysCats, userCatsResult] = await Promise.all([
        getUserPreferences(uid),
        getBudgets(uid),
        getCategories(),
        getUserCategories(uid),
      ]);

      setPreferences(prefs);
      setBudgets(userBudgets);

      // Build unified picker list ─────────────────────────────────────────────
      const items: PickerItem[] = [];

      // 1. System categories (expense type only for budgeting purposes)
      const expenseSysCats = sysCats.filter(c => c.category_type === 'expense' || !c.category_type);
      expenseSysCats.forEach(c => {
        items.push({
          id: c.id,
          name: c.name,
          color: c.color || Colors.primary,
          icon: c.icon || 'tag',
          isUserCategory: false,
          isSubcategory: false,
        });
      });

      // 2. User categories (top-level and subcategories)
      const { all: allUserCats } = userCatsResult;

      // Top-level user categories are those with no parent_id
      const topLevel = allUserCats.filter(c => !c.parent_id);
      const subLevel = allUserCats.filter(c => !!c.parent_id);

      topLevel.forEach(tc => {
        items.push({
          id: tc.id,
          name: tc.name,
          color: tc.color || Colors.primary,
          icon: tc.icon || 'tag',
          isUserCategory: true,
          isSubcategory: false,
        });

        // Add its subcategories immediately after
        subLevel
          .filter(sc => sc.parent_id === tc.id)
          .forEach(sc => {
            items.push({
              id: sc.id,
              name: sc.name,
              color: sc.color || tc.color || Colors.primary,
              icon: sc.icon || 'tag',
              isUserCategory: true,
              isSubcategory: true,
              parentName: tc.name,
            });
          });
      });

      setPickerItems(items);

      // Expenses ──────────────────────────────────────────────────────────────
      const now = new Date();
      const todayString = now.toISOString().split('T')[0];
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const allExpenses = await getExpenses(uid, firstDay);
      setExpenses(allExpenses);

      let todayTotal = 0;
      const catTotals: Record<string, number> = {};

      allExpenses.forEach(exp => {
        if (exp.type === 'expense') {
          if (exp.expense_date.startsWith(todayString)) todayTotal += exp.amount;
          // accumulate per system category
          if (exp.category_id) catTotals[exp.category_id] = (catTotals[exp.category_id] || 0) + exp.amount;
          // accumulate per user category
          if (exp.user_category_id) catTotals[exp.user_category_id] = (catTotals[exp.user_category_id] || 0) + exp.amount;
        }
      });

      setTodaySpent(todayTotal);
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
      } else if (editMode === 'category' && selectedItem) {
        if (selectedItem.isUserCategory) {
          // Custom / sub category budget
          const existing = budgets.find(b => b.user_category_id === selectedItem.id);
          await saveBudget({
            id: existing?.id,
            user_id: dbUserId,
            user_category_id: selectedItem.id,
            amount,
          });
        } else {
          // System category budget
          const existing = budgets.find(b => b.category_id === selectedItem.id);
          await saveBudget({
            id: existing?.id,
            user_id: dbUserId,
            category_id: selectedItem.id,
            amount,
          });
        }
      }
      closeModal();
      loadData(dbUserId);
    } catch (e) {
      console.error('Error saving budget:', e);
    }
  };

  const openEditor = (
    mode: 'daily' | 'savings' | 'category',
    currentAmount: string,
    item?: PickerItem,
  ) => {
    setEditMode(mode);
    setEditAmount(currentAmount);
    setSelectedItem(item ?? null);
    setCategoryStep(mode === 'category' && !item ? 'pick' : 'amount');
    setModalVisible(true);
  };

  const closeModal = () => {
    Keyboard.dismiss();
    setModalVisible(false);
    setEditAmount('');
    setSelectedItem(null);
    setCategoryStep('pick');
  };

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

  // Get a budget's display name, accounting for user_category and category
  const getBudgetLabel = (b: Budget) => {
    if (b.user_category?.name) return b.user_category.name;
    if (b.category?.name) return b.category.name;
    return 'Category';
  };

  // Get a budget's color
  const getBudgetColor = (b: Budget) => {
    return b.user_category?.color || b.category?.color || Colors.primary;
  };

  // Get spent amount for a budget
  const getBudgetSpent = (b: Budget) => {
    if (b.user_category_id) return monthTotals[b.user_category_id] || 0;
    if (b.category_id) return monthTotals[b.category_id] || 0;
    return 0;
  };

  // Find the PickerItem that corresponds to an existing budget (for editing)
  const getPickerItemForBudget = (b: Budget): PickerItem | undefined => {
    if (b.user_category_id) return pickerItems.find(p => p.isUserCategory && p.id === b.user_category_id);
    if (b.category_id) return pickerItems.find(p => !p.isUserCategory && p.id === b.category_id);
    return undefined;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ─── Category Picker UI ───────────────────────────────────────────────────
  const systemItems = pickerItems.filter(p => !p.isUserCategory);
  const userTopItems = pickerItems.filter(p => p.isUserCategory && !p.isSubcategory);

  const renderPickerItem = (item: PickerItem) => {
    const isSelected = selectedItem?.id === item.id && selectedItem?.isUserCategory === item.isUserCategory;
    return (
      <TouchableOpacity
        key={`${item.isUserCategory ? 'u' : 's'}-${item.id}`}
        style={[
          styles.pickerRow,
          item.isSubcategory && styles.pickerRowSub,
          isSelected && { backgroundColor: item.color + '22', borderColor: item.color },
        ]}
        onPress={() => {
          setSelectedItem(item);
          setCategoryStep('amount');
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.pickerDot, { backgroundColor: item.color }]}>
          {item.isSubcategory && <View style={styles.subDotInner} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pickerRowName, isSelected && { color: item.color, fontWeight: '700' }]}>
            {item.name}
          </Text>
          {item.isSubcategory && item.parentName && (
            <Text style={styles.pickerRowSub2}>{item.parentName}</Text>
          )}
        </View>
        {isSelected && <Feather name="check-circle" size={18} color={item.color} />}
      </TouchableOpacity>
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
        <LinearGradient colors={[Colors.primaryMuted, Colors.background]} style={styles.aiCard}>
          <View style={styles.aiTitleRow}>
            <Feather name="cpu" size={18} color={Colors.primary} />
            <Text style={styles.aiTitle}>AI Spending Insights</Text>
          </View>
          {loadingInsights ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 10 }} />
          ) : (
            <Text style={styles.aiText}>{insights || 'Set some budgets and log expenses to get AI insights!'}</Text>
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
            <Text style={styles.savingsSubtext}>Target: {formatCurrency(preferences.savings_goal)}</Text>
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
          <Text style={[styles.emptyText, { marginHorizontal: 20 }]}>No category budgets yet. Tap + to add one.</Text>
        ) : (
          budgets.map(b => {
            const pickerItem = getPickerItemForBudget(b);
            return (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <View style={[styles.budgetDot, { backgroundColor: getBudgetColor(b) }]} />
                    <View>
                      <Text style={styles.cardTitle}>{getBudgetLabel(b)}</Text>
                      {pickerItem?.isSubcategory && pickerItem.parentName && (
                        <Text style={styles.subcatLabel}>{pickerItem.parentName}</Text>
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 15 }}>
                    <TouchableOpacity onPress={() => {
                      deleteBudget(b.id).then(() => { if (dbUserId) loadData(dbUserId); });
                    }}>
                      <Feather name="trash-2" size={16} color={Colors.error} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEditor('category', b.amount.toString(), pickerItem)}>
                      <Feather name="edit-2" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                {renderProgressBar(getBudgetSpent(b), b.amount, getBudgetColor(b))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Editor Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

          <View style={[
            styles.modalContent,
            // Give more height when showing category picker
            editMode === 'category' && categoryStep === 'pick' && { maxHeight: '80%' },
          ]}>
            <View style={styles.modalHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {editMode === 'category' && categoryStep === 'amount' && (
                  <TouchableOpacity onPress={() => { setSelectedItem(null); setCategoryStep('pick'); }} style={styles.backBtn}>
                    <Feather name="arrow-left" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <Text style={styles.modalTitle}>
                  {editMode === 'daily'
                    ? 'Edit Daily Limit'
                    : editMode === 'savings'
                    ? 'Edit Savings Goal'
                    : categoryStep === 'pick'
                    ? 'Select a Category'
                    : `Budget for ${selectedItem?.name}`}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Feather name="x" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Step 1: Category Picker ── */}
            {editMode === 'category' && categoryStep === 'pick' && (
              <ScrollView
                style={styles.categoryPickerScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {systemItems.length > 0 && (
                  <>
                    <Text style={styles.pickerGroupLabel}>Categories</Text>
                    {systemItems.map(renderPickerItem)}
                  </>
                )}

                {userTopItems.length > 0 && (
                  <>
                    <Text style={styles.pickerGroupLabel}>My Categories</Text>
                    {userTopItems.map(item => {
                      const subs = pickerItems.filter(
                        p => p.isUserCategory && p.isSubcategory && p.parentName === item.name,
                      );
                      return (
                        <View key={`u-${item.id}`}>
                          {renderPickerItem(item)}
                          {subs.map(renderPickerItem)}
                        </View>
                      );
                    })}
                  </>
                )}

                {pickerItems.length === 0 && (
                  <Text style={[styles.emptyText, { textAlign: 'center', marginTop: 20 }]}>
                    No categories found.
                  </Text>
                )}
              </ScrollView>
            )}

            {/* ── Step 2: Amount Input ── */}
            {(editMode !== 'category' || categoryStep === 'amount') && (
              <>
                {/* Show selected category chip */}
                {editMode === 'category' && selectedItem && (
                  <View style={[styles.selectedChip, { borderColor: selectedItem.color }]}>
                    <View style={[styles.pickerDot, { backgroundColor: selectedItem.color, width: 10, height: 10, borderRadius: 5 }]} />
                    <Text style={[styles.selectedChipText, { color: selectedItem.color }]}>{selectedItem.name}</Text>
                  </View>
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
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, (!editAmount || (editMode === 'category' && !selectedItem)) && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={!editAmount || (editMode === 'category' && !selectedItem)}
                >
                  <Text style={styles.saveButtonText}>Save Budget</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

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
  subcatLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  budgetDot: { width: 10, height: 10, borderRadius: 5 },

  progressContainer: { marginTop: 5 },
  progressBarBackground: { height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden', marginBottom: 6 },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', fontWeight: '500' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  closeButton: { padding: 4 },
  backBtn: { padding: 4, marginRight: 2 },

  // Category picker
  categoryPickerScroll: { maxHeight: 380, marginBottom: 8 },
  pickerGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
    gap: 12,
  },
  pickerRowSub: {
    paddingLeft: 28,    // indent subcategories
  },
  pickerRowName: { fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  pickerRowSub2: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  pickerDot: { width: 12, height: 12, borderRadius: 6 },
  subDotInner: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)', position: 'absolute', top: 4, left: 4 },

  // Selected chip
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  selectedChipText: { fontSize: 14, fontWeight: '600' },

  inputGroup: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.textPrimary,
  },

  saveButton: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
