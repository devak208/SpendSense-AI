import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, CategoryIcons, PaymentIcons } from '@/constants/Colors';
import {
  getCategories,
  getPaymentMethods,
  createExpense,
  getUserByClerkId,
  createCategory,
  getUserCategories,
  createUserCategory,
  deleteUserCategory,
  Category,
  PaymentMethod,
  UserCategory,
} from '@/lib/supabase';

const CATEGORY_COLORS = ['#22C55E', '#3B82F6', '#EC4899', '#F97316', '#8B5CF6', '#14B8A6', '#EF4444', '#F59E0B'];

export default function AddExpenseScreen() {
  const { userId } = useAuth();
  const router = useRouter();

  // Transaction type toggle
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<UserCategory | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<UserCategory[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateSubcategory, setShowCreateSubcategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId]);

  // When transaction type changes, reset category selection
  useEffect(() => {
    const cats = transactionType === 'expense' ? expenseCategories : incomeCategories;
    if (cats.length > 0) {
      setSelectedCategory(cats[0]);
      setSelectedSubcategory(null);
    }
  }, [transactionType, expenseCategories, incomeCategories]);

  const loadData = async () => {
    if (!userId) return;
    try {
      const user = await getUserByClerkId(userId);
      setDbUserId(user?.id || null);

      // Load expense and income categories separately
      const [expCats, incCats, payments] = await Promise.all([
        getCategories(user?.id, 'expense'),
        getCategories(user?.id, 'income'),
        getPaymentMethods(),
      ]);

      setExpenseCategories(expCats);
      setIncomeCategories(incCats);
      setPaymentMethods(payments);
      if (expCats.length > 0) setSelectedCategory(expCats[0]);
      if (payments.length > 0) setSelectedPayment(payments[0]);

      // Load subcategories
      if (user?.id) {
        try {
          const userCats = await getUserCategories(user.id);
          setSubcategories(userCats.all || []);
        } catch (e) { /* table might not exist */ }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentCategories = transactionType === 'expense' ? expenseCategories : incomeCategories;

  const handleSave = async () => {
    if (!amount || !selectedPayment || !dbUserId || !selectedCategory) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    const amountNum = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const expenseData: any = {
        user_id: dbUserId,
        category_id: selectedCategory.id,
        payment_method_id: selectedPayment.id,
        amount: amountNum,
        type: transactionType,
        note: note || undefined,
        expense_date: date.toISOString().split('T')[0],
      };

      if (selectedSubcategory) {
        expenseData.user_category_id = selectedSubcategory.id;
      }

      await createExpense(expenseData);
      const typeLabel = transactionType === 'income' ? 'Income' : 'Expense';
      Alert.alert('Success', `${typeLabel} added!`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !dbUserId) return;
    setIsCreating(true);
    try {
      const color = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
      const newCat = await createCategory({
        user_id: dbUserId,
        name: newCategoryName.trim(),
        color,
        icon: 'tag',
      });
      if (transactionType === 'expense') {
        setExpenseCategories([...expenseCategories, newCat]);
      } else {
        setIncomeCategories([...incomeCategories, newCat]);
      }
      setSelectedCategory(newCat);
      setSelectedSubcategory(null);
      setNewCategoryName('');
      setShowCreateCategory(false);
      setShowCategoryModal(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateSubcategory = async () => {
    if (!newSubcategoryName.trim() || !dbUserId || !selectedCategory) return;
    setIsCreating(true);
    try {
      const newSub = await createUserCategory({
        user_id: dbUserId,
        name: newSubcategoryName.trim(),
        color: selectedCategory.color,
        category_id: selectedCategory.id,
      });
      setSubcategories(prev => [...prev, newSub]);
      setSelectedSubcategory(newSub);
      setNewSubcategoryName('');
      setShowCreateSubcategory(false);
      setShowSubcategoryModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to create subcategory');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSubcategory = (sub: UserCategory) => {
    Alert.alert('Delete', `Delete "${sub.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteUserCategory(sub.id);
          setSubcategories(prev => prev.filter(c => c.id !== sub.id));
          if (selectedSubcategory?.id === sub.id) setSelectedSubcategory(null);
        } catch { Alert.alert('Error', 'Cannot delete'); }
      }},
    ]);
  };

  const getSubcategoriesForCategory = () => {
    if (!selectedCategory) return [];
    return subcategories.filter(s => s.category_id === selectedCategory.id);
  };

  const formatAmount = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2 || parts[1]?.length > 2) return amount;
    return cleaned;
  };

  const onDateChange = (_: any, d?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (d) setDate(d);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const currentSubcategories = getSubcategoriesForCategory();
  const isUserCategory = selectedCategory?.user_id != null;
  const isIncome = transactionType === 'income';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Transaction</Text>
          </View>

          {/* Income/Expense Toggle - Segmented Control */}
          <View style={styles.toggleWrapper}>
            <View style={styles.toggleTrack}>
              <TouchableOpacity 
                style={[
                  styles.toggleOption, 
                  !isIncome && styles.toggleOptionExpenseActive
                ]}
                onPress={() => setTransactionType('expense')}
                activeOpacity={0.8}
              >
                <Feather name="minus" size={14} color={!isIncome ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.toggleLabel, !isIncome && styles.toggleLabelActive]}>Expense</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.toggleOption, 
                  isIncome && styles.toggleOptionIncomeActive
                ]}
                onPress={() => setTransactionType('income')}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={14} color={isIncome ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.toggleLabel, isIncome && styles.toggleLabelActive]}>Income</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <View style={[styles.amountContainer, isIncome && styles.amountContainerIncome]}>
              <Text style={[styles.currencySymbol, isIncome && styles.currencySymbolIncome]}>
                {isIncome ? '+' : '-'} ₹
              </Text>
              <TextInput
                style={[styles.amountInput, isIncome && styles.amountInputIncome]}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                value={amount}
                onChangeText={(t) => setAmount(formatAmount(t))}
                keyboardType="decimal-pad"
                maxLength={12}
              />
            </View>
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowCategoryModal(true)}>
              <View style={[styles.dropdownIcon, { backgroundColor: (selectedCategory?.color || '#6B7280') + '20' }]}>
                <Feather name={isUserCategory ? 'tag' : (CategoryIcons[selectedCategory?.name || ''] as any || 'package')} size={20} color={selectedCategory?.color || '#6B7280'} />
              </View>
              <Text style={styles.dropdownText}>{selectedCategory?.name || 'Select Category'}</Text>
              {isUserCategory && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
              <Feather name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Subcategory */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subcategory (Optional)</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowSubcategoryModal(true)}>
              <View style={[styles.dropdownIcon, { backgroundColor: (selectedCategory?.color || '#6B7280') + '20' }]}>
                <Feather name="layers" size={20} color={selectedCategory?.color || '#6B7280'} />
              </View>
              <Text style={styles.dropdownText}>{selectedSubcategory?.name || 'Select or Create'}</Text>
              <Feather name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Feather name="calendar" size={20} color={Colors.textSecondary} />
              <Text style={styles.dateText}>{date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            </TouchableOpacity>
            {showDatePicker && <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onDateChange} maximumDate={new Date()} themeVariant="light" />}
          </View>

          {/* Payment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isIncome ? 'Received Via' : 'Payment Method'}</Text>
            <View style={styles.paymentRow}>
              {paymentMethods.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.paymentChip, selectedPayment?.id === m.id && styles.paymentChipSelected, selectedPayment?.id === m.id && isIncome && styles.paymentChipIncome]} onPress={() => setSelectedPayment(m)}>
                  <Feather name={PaymentIcons[m.name] as any || 'credit-card'} size={16} color={selectedPayment?.id === m.id ? '#FFF' : Colors.textSecondary} />
                  <Text style={[styles.paymentText, selectedPayment?.id === m.id && styles.paymentTextSelected]}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity 
            style={[styles.saveBtn, saving && styles.saveBtnDisabled, isIncome && styles.saveBtnIncome]} 
            onPress={handleSave} 
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Feather name={isIncome ? 'plus-circle' : 'minus-circle'} size={20} color="#FFF" />
                <Text style={styles.saveBtnText}>Save {isIncome ? 'Income' : 'Expense'}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Modal */}
      <Modal visible={showCategoryModal} animationType="slide">
        <SafeAreaView style={styles.fullModal}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => { setShowCategoryModal(false); setShowCreateCategory(false); }}>
              <Feather name="x" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>{isIncome ? 'Income' : 'Expense'} Category</Text>
            <View style={{ width: 24 }} />
          </View>

          {!showCreateCategory ? (
            <>
              <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
                {currentCategories.map((cat) => {
                  const isCustom = cat.user_id != null;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.listItem, selectedCategory?.id === cat.id && styles.listItemSelected]}
                      onPress={() => { setSelectedCategory(cat); setSelectedSubcategory(null); setShowCategoryModal(false); }}
                    >
                      <View style={[styles.listItemIcon, { backgroundColor: cat.color + '20' }]}>
                        <Feather name={isCustom ? 'tag' : (CategoryIcons[cat.name] as any || 'package')} size={22} color={cat.color} />
                      </View>
                      <Text style={styles.listItemText}>{cat.name}</Text>
                      {isCustom && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                      {selectedCategory?.id === cat.id && <Feather name="check" size={22} color={isIncome ? Colors.success : Colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 100 }} />
              </ScrollView>

              <View style={styles.bottomAction}>
                <TouchableOpacity style={[styles.createNewBtn, isIncome && styles.createNewBtnIncome]} onPress={() => setShowCreateCategory(true)}>
                  <Feather name="plus" size={20} color="#FFF" />
                  <Text style={styles.createNewBtnText}>Create New Category</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <KeyboardAvoidingView style={styles.createForm} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <Text style={styles.createFormTitle}>Create {isIncome ? 'Income' : 'Expense'} Category</Text>
              <TextInput
                style={styles.createFormInput}
                placeholder="Enter category name..."
                placeholderTextColor={Colors.textMuted}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus
              />
              <View style={styles.createFormActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowCreateCategory(false); setNewCategoryName(''); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.confirmBtn, (!newCategoryName.trim() || isCreating) && styles.confirmBtnDisabled, isIncome && styles.confirmBtnIncome]} 
                  onPress={handleCreateCategory}
                  disabled={!newCategoryName.trim() || isCreating}
                >
                  {isCreating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Subcategory Modal */}
      <Modal visible={showSubcategoryModal} animationType="slide">
        <SafeAreaView style={styles.fullModal}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => { setShowSubcategoryModal(false); setShowCreateSubcategory(false); }}>
              <Feather name="x" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>Subcategory</Text>
            <View style={{ width: 24 }} />
          </View>

          {!showCreateSubcategory ? (
            <>
              <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.listItem, !selectedSubcategory && styles.listItemSelected]}
                  onPress={() => { setSelectedSubcategory(null); setShowSubcategoryModal(false); }}
                >
                  <View style={[styles.listItemIcon, { backgroundColor: Colors.card }]}>
                    <Feather name="minus" size={22} color={Colors.textSecondary} />
                  </View>
                  <Text style={styles.listItemText}>None</Text>
                  {!selectedSubcategory && <Feather name="check" size={22} color={isIncome ? Colors.success : Colors.primary} />}
                </TouchableOpacity>

                {currentSubcategories.length > 0 && <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Subcategories</Text>}
                {currentSubcategories.map((sub) => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.listItem, selectedSubcategory?.id === sub.id && styles.listItemSelected]}
                    onPress={() => { setSelectedSubcategory(sub); setShowSubcategoryModal(false); }}
                    onLongPress={() => handleDeleteSubcategory(sub)}
                  >
                    <View style={[styles.listItemIcon, { backgroundColor: sub.color + '20' }]}>
                      <Feather name="tag" size={22} color={sub.color} />
                    </View>
                    <Text style={styles.listItemText}>{sub.name}</Text>
                    {selectedSubcategory?.id === sub.id && <Feather name="check" size={22} color={isIncome ? Colors.success : Colors.primary} />}
                  </TouchableOpacity>
                ))}

                {currentSubcategories.length === 0 && (
                  <View style={styles.emptyState}>
                    <Feather name="layers" size={48} color={Colors.textMuted} />
                    <Text style={styles.emptyStateText}>No subcategories yet</Text>
                  </View>
                )}
                {currentSubcategories.length > 0 && <Text style={styles.deleteHint}>Long-press to delete</Text>}
                <View style={{ height: 100 }} />
              </ScrollView>

              <View style={styles.bottomAction}>
                <TouchableOpacity style={[styles.createNewBtn, isIncome && styles.createNewBtnIncome]} onPress={() => setShowCreateSubcategory(true)}>
                  <Feather name="plus" size={20} color="#FFF" />
                  <Text style={styles.createNewBtnText}>Create New Subcategory</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <KeyboardAvoidingView style={styles.createForm} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <Text style={styles.createFormTitle}>Subcategory for {selectedCategory?.name}</Text>
              <TextInput
                style={styles.createFormInput}
                placeholder="e.g., Monthly, Bonus, Commission..."
                placeholderTextColor={Colors.textMuted}
                value={newSubcategoryName}
                onChangeText={setNewSubcategoryName}
                autoFocus
              />
              <View style={styles.createFormActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowCreateSubcategory(false); setNewSubcategoryName(''); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.confirmBtn, (!newSubcategoryName.trim() || isCreating) && styles.confirmBtnDisabled, isIncome && styles.confirmBtnIncome]} 
                  onPress={handleCreateSubcategory}
                  disabled={!newSubcategoryName.trim() || isCreating}
                >
                  {isCreating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  header: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary },

  // Toggle - Segmented Control Style
  toggleWrapper: { marginBottom: 16, alignItems: 'center' },
  toggleTrack: { 
    flexDirection: 'row', 
    backgroundColor: Colors.card, 
    borderRadius: 20, 
    padding: 3,
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 17,
    gap: 5,
  },
  toggleOptionExpenseActive: {
    backgroundColor: Colors.error,
  },
  toggleOptionIncomeActive: {
    backgroundColor: Colors.success,
  },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  toggleLabelActive: { color: '#FFF' },

  // Keep old toggle styles for backward compatibility
  toggleContainer: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 16, padding: 4, marginBottom: 20, gap: 4 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 8 },
  toggleBtnActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  toggleBtnExpense: { backgroundColor: Colors.error },
  toggleBtnIncome: { backgroundColor: Colors.success },
  toggleText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: '#FFF' },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  
  // Amount - Compact
  amountContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.error + '25' },
  amountContainerIncome: { borderColor: Colors.success + '25' },
  currencySymbol: { fontSize: 24, fontWeight: '600', color: Colors.error, marginRight: 2 },
  currencySymbolIncome: { color: Colors.success },
  amountInput: { fontSize: 36, fontWeight: 'bold', color: Colors.textPrimary, minWidth: 60, textAlign: 'center' },
  amountInputIncome: { },

  dropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 12 },
  dropdownIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  dropdownText: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  customBadge: { backgroundColor: Colors.primary + '15', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginRight: 6 },
  customBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.primary },

  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 12, gap: 10 },
  dateText: { fontSize: 15, color: Colors.textPrimary },

  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 6, borderWidth: 1, borderColor: Colors.border },
  paymentChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  paymentChipIncome: { backgroundColor: Colors.success, borderColor: Colors.success },
  paymentText: { fontSize: 13, color: Colors.textSecondary },
  paymentTextSelected: { color: '#FFF', fontWeight: '500' },

  noteInput: { backgroundColor: Colors.card, borderRadius: 12, padding: 12, fontSize: 15, color: Colors.textPrimary, minHeight: 60, textAlignVertical: 'top' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.error, borderRadius: 14, padding: 14, gap: 6, marginTop: 12 },
  saveBtnIncome: { backgroundColor: Colors.success },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },

  // Full Screen Modal
  fullModal: { flex: 1, backgroundColor: Colors.background },
  fullModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fullModalTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  fullModalScroll: { flex: 1, padding: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: 12 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 10 },
  listItemSelected: { backgroundColor: Colors.primary + '15', borderWidth: 2, borderColor: Colors.primary },
  listItemIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  listItemText: { flex: 1, fontSize: 17, fontWeight: '500', color: Colors.textPrimary },
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  createNewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 14, padding: 16, gap: 10 },
  createNewBtnIncome: { backgroundColor: Colors.success },
  createNewBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateText: { fontSize: 18, fontWeight: '600', color: Colors.textSecondary, marginTop: 16 },
  deleteHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 16 },

  // Create Form
  createForm: { flex: 1, padding: 20, justifyContent: 'center' },
  createFormTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 24, textAlign: 'center' },
  createFormInput: { backgroundColor: Colors.card, borderRadius: 14, padding: 18, fontSize: 18, color: Colors.textPrimary, textAlign: 'center' },
  createFormActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: Colors.card, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  confirmBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmBtnIncome: { backgroundColor: Colors.success },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
