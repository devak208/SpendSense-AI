import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
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
  Animated,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

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
  createDebt,
  Category,
  PaymentMethod,
  UserCategory,
} from '@/lib/supabase';

const CATEGORY_COLORS = ['#22C55E', '#3B82F6', '#EC4899', '#F97316', '#8B5CF6', '#14B8A6', '#EF4444', '#F59E0B'];

// Skeleton Loading Component
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

// Loading Skeleton for the form
const FormSkeleton = () => (
  <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
    <SkeletonBox width="100%" height={80} style={{ borderRadius: 14, marginBottom: 20 }} />
    <SkeletonBox width={80} height={12} style={{ marginBottom: 8 }} />
    <SkeletonBox width="100%" height={56} style={{ borderRadius: 12, marginBottom: 16 }} />
    <SkeletonBox width={100} height={12} style={{ marginBottom: 8 }} />
    <SkeletonBox width="100%" height={56} style={{ borderRadius: 12, marginBottom: 16 }} />
    <SkeletonBox width={60} height={12} style={{ marginBottom: 8 }} />
    <SkeletonBox width="100%" height={56} style={{ borderRadius: 12, marginBottom: 16 }} />
    <SkeletonBox width={120} height={12} style={{ marginBottom: 8 }} />
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
      <SkeletonBox width={80} height={36} style={{ borderRadius: 18 }} />
      <SkeletonBox width={80} height={36} style={{ borderRadius: 18 }} />
      <SkeletonBox width={80} height={36} style={{ borderRadius: 18 }} />
    </View>
    <SkeletonBox width="100%" height={48} style={{ borderRadius: 10, marginTop: 12 }} />
  </View>
);

export default function AddExpenseScreen() {
  const { userId } = useAuth();
  const router = useRouter();

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

  // Split expense state
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitPeopleCount, setSplitPeopleCount] = useState(2);
  const [splitNote, setSplitNote] = useState('');

  useEffect(() => { loadData(); }, [userId]);

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

    // Validate split settings
    if (splitEnabled && splitPeopleCount < 2) {
      Alert.alert('Error', 'Split requires at least 2 people');
      return;
    }

    setSaving(true);
    try {
      // Calculate split amounts
      const userShare = splitEnabled ? Math.round((amountNum / splitPeopleCount) * 100) / 100 : amountNum;
      const friendsShare = splitEnabled ? Math.round((amountNum - userShare) * 100) / 100 : 0;

      // Create expense with full amount (annotated with split info if enabled)
      const expenseNote = splitEnabled
        ? `${note ? note + ' | ' : ''}Split: ₹${userShare.toFixed(2)} (you) + ₹${friendsShare.toFixed(2)} (${splitPeopleCount - 1} friends)`
        : note || undefined;

      const expenseData: any = {
        user_id: dbUserId,
        category_id: selectedCategory.id,
        payment_method_id: selectedPayment.id,
        amount: amountNum, // Full amount for expense tracking
        type: transactionType,
        note: expenseNote,
        expense_date: date.toISOString().split('T')[0],
      };

      if (selectedSubcategory) {
        expenseData.user_category_id = selectedSubcategory.id;
      }

      await createExpense(expenseData);

      // If split enabled, create debt for friends' share
      if (splitEnabled && friendsShare > 0) {
        const debtName = splitNote.trim()
          ? `Split: ${splitNote.trim()}`
          : `Split: ${selectedCategory.name}${note ? ` - ${note}` : ''}`;

        await createDebt({
          user_id: dbUserId,
          name: debtName,
          description: `Split expense of ₹${amountNum} among ${splitPeopleCount} people`,
          amount: friendsShare,
          debt_type: 'other',
          direction: 'receivable', // Money owed TO user
          is_recurring: false,
          reminder_enabled: false,
          // No due_date - as per user request
        });
      }

      const typeLabel = transactionType === 'income' ? 'Income' : 'Expense';
      const successMsg = splitEnabled
        ? `${typeLabel} added! ₹${friendsShare.toFixed(2)} added to debts.`
        : `${typeLabel} added!`;
      Alert.alert('Success', successMsg, [
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
        category_type: transactionType,
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
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteUserCategory(sub.id);
            setSubcategories(prev => prev.filter(c => c.id !== sub.id));
            if (selectedSubcategory?.id === sub.id) setSelectedSubcategory(null);
          } catch { Alert.alert('Error', 'Cannot delete'); }
        }
      },
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

  const currentSubcategories = getSubcategoriesForCategory();
  const isUserCategory = selectedCategory?.user_id != null;
  const isIncome = transactionType === 'income';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header with Gradient */}
          <LinearGradient
            colors={isIncome ? [Colors.success + '20', Colors.background] : [Colors.surfaceElevated, Colors.background]}
            style={styles.headerGradient}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Add Transaction</Text>
            </View>

            {/* Decorative Feature Card */}
            <View style={styles.featureCard}>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>
                  {isIncome ? (
                    <><Text style={{ color: Colors.success }}>Record</Text> your income</>
                  ) : (
                    <><Text style={{ color: Colors.error }}>Track</Text> your spending</>
                  )}
                </Text>
                <Text style={styles.featureSubtitle}>
                  {isIncome ? 'Keep track of all earnings' : 'Monitor where your money goes'}
                </Text>
              </View>
              <View style={styles.featureDecor}>
                <View style={[styles.decorCircle1, isIncome && { backgroundColor: Colors.successLight }]} />
                <View style={[styles.decorCircle2, isIncome && { backgroundColor: Colors.successLight }]} />
                <View style={styles.decorIcon}>
                  <Feather
                    name={isIncome ? 'trending-up' : 'trending-down'}
                    size={24}
                    color={isIncome ? Colors.success : Colors.error}
                  />
                </View>
              </View>
            </View>
          </LinearGradient>

          {loading ? (
            <FormSkeleton />
          ) : (
            <View style={styles.form}>
              {/* Income/Expense Toggle */}
              <View style={styles.toggleWrapper}>
                <View style={styles.toggleTrack}>
                  <TouchableOpacity
                    style={[styles.toggleOption, !isIncome && styles.toggleOptionExpenseActive]}
                    onPress={() => setTransactionType('expense')}
                    activeOpacity={0.8}
                  >
                    <Feather name="arrow-up-right" size={14} color={!isIncome ? '#FFF' : Colors.textSecondary} />
                    <Text style={[styles.toggleLabel, !isIncome && styles.toggleLabelActive]}>Expense</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleOption, isIncome && styles.toggleOptionIncomeActive]}
                    onPress={() => setTransactionType('income')}
                    activeOpacity={0.8}
                  >
                    <Feather name="arrow-down-left" size={14} color={isIncome ? '#FFF' : Colors.textSecondary} />
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
                    style={styles.amountInput}
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
                    <Feather name={isUserCategory ? 'tag' : (CategoryIcons[selectedCategory?.name || ''] as any || 'package')} size={16} color={selectedCategory?.color || '#6B7280'} />
                  </View>
                  <Text style={styles.dropdownText}>{selectedCategory?.name || 'Select Category'}</Text>
                  {isUserCategory && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                  <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Subcategory */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Subcategory (Optional)</Text>
                <TouchableOpacity style={styles.dropdown} onPress={() => setShowSubcategoryModal(true)}>
                  <View style={[styles.dropdownIcon, { backgroundColor: (selectedCategory?.color || '#6B7280') + '20' }]}>
                    <Feather name="layers" size={16} color={selectedCategory?.color || '#6B7280'} />
                  </View>
                  <Text style={styles.dropdownText}>{selectedSubcategory?.name || 'Select or Create'}</Text>
                  <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Date */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Date</Text>
                <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                  <View style={[styles.dropdownIcon, { backgroundColor: Colors.goldLight }]}>
                    <Feather name="calendar" size={16} color={Colors.gold} />
                  </View>
                  <Text style={styles.dropdownText}>
                    {date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                    maximumDate={new Date()}
                    themeVariant="light"
                  />
                )}
              </View>

              {/* Payment Method */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{isIncome ? 'Received Via' : 'Payment Method'}</Text>
                <View style={styles.paymentRow}>
                  {paymentMethods.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.paymentChip,
                        selectedPayment?.id === m.id && styles.paymentChipSelected,
                        selectedPayment?.id === m.id && isIncome && styles.paymentChipIncome
                      ]}
                      onPress={() => setSelectedPayment(m)}
                    >
                      <Feather name={PaymentIcons[m.name] as any || 'credit-card'} size={14} color={selectedPayment?.id === m.id ? '#FFF' : Colors.textSecondary} />
                      <Text style={[styles.paymentText, selectedPayment?.id === m.id && styles.paymentTextSelected]}>{m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Split Expense Section - Only for expenses */}
              {!isIncome && (
                <View style={styles.section}>
                  <View style={styles.splitHeader}>
                    <View style={styles.splitTitleRow}>
                      <View style={[styles.dropdownIcon, { backgroundColor: Colors.primaryMuted }]}>
                        <Feather name="users" size={16} color={Colors.primary} />
                      </View>
                      <Text style={styles.splitTitle}>Split with Friends</Text>
                    </View>
                    <Switch
                      value={splitEnabled}
                      onValueChange={(value) => {
                        setSplitEnabled(value);
                        if (!value) {
                          setSplitPeopleCount(2);
                          setSplitNote('');
                        }
                      }}
                      trackColor={{ false: Colors.border, true: Colors.primaryMuted }}
                      thumbColor={splitEnabled ? Colors.primary : Colors.textMuted}
                    />
                  </View>

                  {splitEnabled && (
                    <View style={styles.splitContent}>
                      {/* People Counter */}
                      <View style={styles.splitRow}>
                        <Text style={styles.splitLabel}>Total People (including you)</Text>
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, splitPeopleCount <= 2 && styles.stepperBtnDisabled]}
                            onPress={() => setSplitPeopleCount(Math.max(2, splitPeopleCount - 1))}
                            disabled={splitPeopleCount <= 2}
                          >
                            <Feather name="minus" size={16} color={splitPeopleCount <= 2 ? Colors.textMuted : Colors.textPrimary} />
                          </TouchableOpacity>
                          <Text style={styles.stepperValue}>{splitPeopleCount}</Text>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => setSplitPeopleCount(splitPeopleCount + 1)}
                          >
                            <Feather name="plus" size={16} color={Colors.textPrimary} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Split Preview */}
                      {amount && parseFloat(amount.replace(/,/g, '')) > 0 && (
                        <View style={styles.splitPreview}>
                          <View style={styles.splitPreviewRow}>
                            <Text style={styles.splitPreviewLabel}>Your share</Text>
                            <Text style={styles.splitPreviewValue}>
                              ₹{(parseFloat(amount.replace(/,/g, '')) / splitPeopleCount).toFixed(2)}
                            </Text>
                          </View>
                          <View style={styles.splitPreviewRow}>
                            <Text style={styles.splitPreviewLabel}>Friends owe you</Text>
                            <Text style={[styles.splitPreviewValue, { color: Colors.success }]}>
                              ₹{(parseFloat(amount.replace(/,/g, '')) - (parseFloat(amount.replace(/,/g, '')) / splitPeopleCount)).toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Split Note */}
                      <TextInput
                        style={styles.splitNoteInput}
                        placeholder="Split description (e.g., Dinner at ABC)"
                        placeholderTextColor={Colors.textMuted}
                        value={splitNote}
                        onChangeText={setSplitNote}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Feather name={isIncome ? 'plus-circle' : 'check'} size={18} color="#FFF" />
                    <Text style={styles.saveBtnText}>Save {isIncome ? 'Income' : 'Expense'}</Text>
                    <Text style={styles.saveBtnChevron}>»</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Modal */}
      <Modal visible={showCategoryModal} animationType="slide">
        <SafeAreaView style={styles.fullModal}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => { setShowCategoryModal(false); setShowCreateCategory(false); }}>
              <Feather name="x" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>{isIncome ? 'Income' : 'Expense'} Category</Text>
            <View style={{ width: 22 }} />
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
                        <Feather name={isCustom ? 'tag' : (CategoryIcons[cat.name] as any || 'package')} size={18} color={cat.color} />
                      </View>
                      <Text style={styles.listItemText}>{cat.name}</Text>
                      {isCustom && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                      {selectedCategory?.id === cat.id && <Feather name="check" size={18} color={isIncome ? Colors.success : Colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 100 }} />
              </ScrollView>

              <View style={styles.bottomAction}>
                <TouchableOpacity style={[styles.createNewBtn, isIncome && styles.createNewBtnIncome]} onPress={() => setShowCreateCategory(true)}>
                  <Feather name="plus" size={18} color="#FFF" />
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
              <Feather name="x" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>Subcategory</Text>
            <View style={{ width: 22 }} />
          </View>

          {!showCreateSubcategory ? (
            <>
              <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.listItem, !selectedSubcategory && styles.listItemSelected]}
                  onPress={() => { setSelectedSubcategory(null); setShowSubcategoryModal(false); }}
                >
                  <View style={[styles.listItemIcon, { backgroundColor: Colors.border }]}>
                    <Feather name="minus" size={18} color={Colors.textSecondary} />
                  </View>
                  <Text style={styles.listItemText}>None</Text>
                  {!selectedSubcategory && <Feather name="check" size={18} color={isIncome ? Colors.success : Colors.primary} />}
                </TouchableOpacity>

                {currentSubcategories.length > 0 && <Text style={styles.sectionLabel}>Subcategories</Text>}
                {currentSubcategories.map((sub) => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.listItem, selectedSubcategory?.id === sub.id && styles.listItemSelected]}
                    onPress={() => { setSelectedSubcategory(sub); setShowSubcategoryModal(false); }}
                    onLongPress={() => handleDeleteSubcategory(sub)}
                  >
                    <View style={[styles.listItemIcon, { backgroundColor: sub.color + '20' }]}>
                      <Feather name="tag" size={18} color={sub.color} />
                    </View>
                    <Text style={styles.listItemText}>{sub.name}</Text>
                    {selectedSubcategory?.id === sub.id && <Feather name="check" size={18} color={isIncome ? Colors.success : Colors.primary} />}
                  </TouchableOpacity>
                ))}

                {currentSubcategories.length === 0 && (
                  <View style={styles.emptyState}>
                    <Feather name="layers" size={40} color={Colors.textMuted} />
                    <Text style={styles.emptyStateText}>No subcategories yet</Text>
                  </View>
                )}
                {currentSubcategories.length > 0 && <Text style={styles.deleteHint}>Long-press to delete</Text>}
                <View style={{ height: 100 }} />
              </ScrollView>

              <View style={styles.bottomAction}>
                <TouchableOpacity style={[styles.createNewBtn, isIncome && styles.createNewBtnIncome]} onPress={() => setShowCreateSubcategory(true)}>
                  <Feather name="plus" size={18} color="#FFF" />
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
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: 100
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
    color: Colors.textPrimary
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
    backgroundColor: Colors.errorLight,
    opacity: 0.5,
    top: -5,
    right: -5,
  },
  decorCircle2: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.goldLight,
    opacity: 0.6,
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

  // Form
  form: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // Toggle
  toggleWrapper: {
    marginBottom: 20,
    alignItems: 'center'
  },
  toggleTrack: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 6,
  },
  toggleOptionExpenseActive: {
    backgroundColor: Colors.error,
  },
  toggleOptionIncomeActive: {
    backgroundColor: Colors.success,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary
  },
  toggleLabelActive: {
    color: '#FFF'
  },

  section: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },

  // Amount
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  amountContainerIncome: {
    borderColor: Colors.success + '40'
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.error,
    marginRight: 2
  },
  currencySymbolIncome: {
    color: Colors.success
  },
  amountInput: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textPrimary,
    minWidth: 60,
    textAlign: 'center'
  },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dropdownIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  customBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6
  },
  customBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary
  },

  // Payment
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  paymentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border
  },
  paymentChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary
  },
  paymentChipIncome: {
    backgroundColor: Colors.success,
    borderColor: Colors.success
  },
  paymentText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  paymentTextSelected: {
    color: '#FFF'
  },

  // Save Button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginTop: 20
  },
  saveBtnDisabled: {
    opacity: 0.7
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000'
  },
  saveBtnChevron: {
    fontSize: 16,
    color: '#FFF',
    marginLeft: 2,
  },

  // Full Screen Modal
  fullModal: {
    flex: 1,
    backgroundColor: Colors.background
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  fullModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary
  },
  fullModalScroll: {
    flex: 1,
    padding: 20
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listItemSelected: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary
  },
  listItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary
  },
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border
  },
  createNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    gap: 8
  },
  createNewBtnIncome: {
    backgroundColor: Colors.success
  },
  createNewBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000'
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 12
  },
  deleteHint: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 12
  },

  // Create Form
  createForm: {
    flex: 1,
    padding: 20,
    justifyContent: 'center'
  },
  createFormTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center'
  },
  createFormInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  createFormActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary
  },
  confirmBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center'
  },
  confirmBtnIncome: {
    backgroundColor: Colors.success
  },
  confirmBtnDisabled: {
    opacity: 0.5
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF'
  },

  // Split Expense Styles
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  splitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  splitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  splitContent: {
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    minWidth: 30,
    textAlign: 'center',
  },
  splitPreview: {
    backgroundColor: Colors.successLight,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  splitPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitPreviewLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  splitPreviewValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  splitNoteInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
