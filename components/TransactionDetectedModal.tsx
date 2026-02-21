// Transaction Detected Modal
// Popup shown when a bank SMS transaction is detected

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, CategoryIcons, PaymentIcons } from '@/constants/Colors';
import { ParsedTransaction, formatTransactionAmount } from '@/lib/bankSmsParser';
import {
  Category,
  PaymentMethod,
  UserCategory,
  createCategory,
  createUserCategory,
  getUserByClerkId,
  deleteUserCategory
} from '@/lib/supabase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CATEGORY_COLORS = ['#22C55E', '#3B82F6', '#EC4899', '#F97316', '#8B5CF6', '#14B8A6', '#EF4444', '#F59E0B'];

interface TransactionDetectedModalProps {
  visible: boolean;
  transaction: ParsedTransaction | null;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onSave: (data: {
    amount: number;
    type: 'expense' | 'income';
    categoryId: string;
    userCategoryId?: string;
    paymentMethodId: string;
    note: string;
  }) => void;
  onDismiss: () => void;
  onCategoryCreated?: (category: Category) => void;
  onSubCategoryCreated?: (subCategory: UserCategory) => void;
}

// Helper to map invalid database icons to valid Feather icons
const getValidIconName = (iconName: string): any => {
  const mapping: Record<string, string> = {
    'building': 'home',
    'banknote': 'dollar-sign',
    'qr-code': 'maximize',
    'wallet': 'credit-card',
    'money-bill': 'dollar-sign',
    'receipt': 'file-text'
  };
  return mapping[iconName] || iconName;
};

export default function TransactionDetectedModal({
  visible,
  transaction,
  categories,
  subCategories,
  paymentMethods,
  onSave,
  onDismiss,
  onCategoryCreated,
  onSubCategoryCreated,
}: TransactionDetectedModalProps & { subCategories: UserCategory[] }) {
  const { userId } = useAuth();
  const [dbUserId, setDbUserId] = useState<string | null>(null);

  // Local state
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const [localSubCategories, setLocalSubCategories] = useState<UserCategory[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState(0);

  // UI State for Modals
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);

  // Creation State
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateSubcategory, setShowCreateSubcategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Initialize Data
  useEffect(() => {
    setLocalCategories(categories);
    setLocalSubCategories(subCategories);
  }, [categories, subCategories]);

  useEffect(() => {
    if (userId) {
      getUserByClerkId(userId).then(u => setDbUserId(u?.id || null));
    }
  }, [userId]);

  useEffect(() => {
    if (visible && transaction) {
      setAmount(transaction.amount);
      setNote(transaction.bankName ? `${transaction.bankName} transaction` : 'Bank transaction');

      // Set default category based on transaction type
      const relevantCategories = localCategories.filter(
        c => c.category_type === (transaction.type === 'credit' ? 'income' : 'expense')
      );
      if (relevantCategories.length > 0) {
        setSelectedCategoryId(relevantCategories[0].id);
        setSelectedSubCategoryId('');
      }

      // Set default payment method
      if (paymentMethods.length > 0) {
        setSelectedPaymentMethodId(paymentMethods[0].id);
      }

      // Animate in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, transaction, localCategories]); // Depend on localCategories to update defaults if data changes

  const handleSave = () => {
    if (!selectedCategoryId || !selectedPaymentMethodId || !transaction) return;

    onSave({
      amount,
      type: transaction.type === 'credit' ? 'income' : 'expense',
      categoryId: selectedCategoryId,
      userCategoryId: selectedSubCategoryId || undefined,
      paymentMethodId: selectedPaymentMethodId,
      note,
    });
  };

  const handleCreateNewCategory = async () => {
    if (!newCategoryName.trim() || !dbUserId || !transaction) return;
    setIsCreating(true);
    try {
      const color = CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
      const newCat = await createCategory({
        user_id: dbUserId,
        name: newCategoryName.trim(),
        color,
        icon: 'tag',
        category_type: transaction.type === 'credit' ? 'income' : 'expense'
      });

      setLocalCategories(prev => [...prev, newCat]);
      setSelectedCategoryId(newCat.id);
      setSelectedSubCategoryId('');
      setNewCategoryName('');
      setShowCreateCategory(false);
      setShowCategoryModal(false);
      // Propagate to parent context so category persists
      onCategoryCreated?.(newCat);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateNewSubCategory = async () => {
    if (!newSubcategoryName.trim() || !dbUserId || !selectedCategoryId) return;
    setIsCreating(true);
    try {
      // Find parent category color
      const parent = localCategories.find(c => c.id === selectedCategoryId);
      const newSub = await createUserCategory({
        user_id: dbUserId,
        name: newSubcategoryName.trim(),
        color: parent?.color || Colors.primary,
        category_id: selectedCategoryId,
      });

      setLocalSubCategories(prev => [...prev, newSub]);
      setSelectedSubCategoryId(newSub.id);
      setNewSubcategoryName('');
      setShowCreateSubcategory(false);
      setShowSubCategoryModal(false);
      // Propagate to parent context so subcategory persists
      onSubCategoryCreated?.(newSub);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to create sub-category');
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
            setLocalSubCategories(prev => prev.filter(c => c.id !== sub.id));
            if (selectedSubCategoryId === sub.id) setSelectedSubCategoryId('');
          } catch { Alert.alert('Error', 'Cannot delete'); }
        }
      },
    ]);
  };

  if (!transaction) return null;

  const isCredit = transaction.type === 'credit';
  const filteredCategories = localCategories.filter(
    c => c.category_type === (isCredit ? 'income' : 'expense')
  );

  const filteredSubCategories = localSubCategories.filter(
    s => s.category_id === selectedCategoryId
  );

  const selectedCategory = localCategories.find(c => c.id === selectedCategoryId);
  const selectedSub = localSubCategories.find(s => s.id === selectedSubCategoryId);
  const isUserCategory = selectedCategory?.user_id != null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} />

        <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
          {/* Header with gradient */}
          <LinearGradient
            colors={isCredit ? [Colors.successLight, '#FFFFFF'] : [Colors.errorLight, '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            {/* Decorative circles */}
            <View style={[styles.decorCircle1, { backgroundColor: isCredit ? Colors.success + '20' : Colors.error + '20' }]} />
            <View style={[styles.decorCircle2, { backgroundColor: Colors.goldLight }]} />

            <View style={styles.headerContent}>
              <View style={[styles.transactionBadge, { backgroundColor: isCredit ? Colors.success : Colors.error }]}>
                <Feather
                  name={isCredit ? 'arrow-down-left' : 'arrow-up-right'}
                  size={16}
                  color="#FFF"
                />
              </View>
              <Text style={styles.headerTitle}>
                Transaction Detected
              </Text>
              <Text style={styles.headerSubtitle}>
                {transaction.bankName || 'Bank'} • {isCredit ? 'Money Received' : 'Money Spent'}
              </Text>
            </View>
          </LinearGradient>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flexShrink: 1 }}>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Amount Display */}
              <View style={[styles.amountCard, { borderColor: isCredit ? Colors.success : Colors.error }]}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={[styles.amountValue, { color: isCredit ? Colors.success : Colors.error }]}>
                  {formatTransactionAmount(amount, transaction.type as 'debit' | 'credit')}
                </Text>
                {transaction.accountLast4 && (
                  <Text style={styles.accountInfo}>
                    Account ending ••••{transaction.accountLast4}
                  </Text>
                )}
              </View>

              {/* Category Dropdown */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Category</Text>
                <TouchableOpacity style={styles.dropdown} onPress={() => setShowCategoryModal(true)}>
                  <View style={[styles.dropdownIcon, { backgroundColor: (selectedCategory?.color || '#6B7280') + '20' }]}>
                    <Feather name={isUserCategory ? 'tag' : (getValidIconName(CategoryIcons[selectedCategory?.name || ''] || 'package'))} size={16} color={selectedCategory?.color || '#6B7280'} />
                  </View>
                  <Text style={styles.dropdownText}>{selectedCategory?.name || 'Select Category'}</Text>
                  {isUserCategory && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                  <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Sub-Category Dropdown */}
              {(selectedCategory) && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Sub-Category {filteredSubCategories.length === 0 && '(Optional)'}</Text>
                  <TouchableOpacity style={styles.dropdown} onPress={() => setShowSubCategoryModal(true)}>
                    <View style={[styles.dropdownIcon, { backgroundColor: (selectedCategory?.color || '#6B7280') + '20' }]}>
                      <Feather name="layers" size={16} color={selectedCategory?.color || '#6B7280'} />
                    </View>
                    <Text style={styles.dropdownText}>{selectedSub?.name || 'Select or Create'}</Text>
                    <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Payment Method Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Method</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                  {paymentMethods.map((method) => {
                    const isSelected = selectedPaymentMethodId === method.id;
                    return (
                      <TouchableOpacity
                        key={method.id}
                        style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                        onPress={() => setSelectedPaymentMethodId(method.id)}
                      >
                        <Feather name={getValidIconName(method.icon || 'credit-card')} size={14} color={isSelected ? Colors.primary : Colors.textSecondary} />
                        <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                          {method.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Note Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Note</Text>
                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.saveButton, (!selectedCategoryId || !selectedPaymentMethodId) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!selectedCategoryId || !selectedPaymentMethodId}
            >
              <Feather name="check" size={18} color="#FFF" />
              <Text style={styles.saveButtonText}>Save {isCredit ? 'Income' : 'Expense'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>

      {/* --- NESTED MODALS FOR SELECTION --- */}

      {/* Category Selection Modal */}
      <Modal visible={showCategoryModal} animationType="slide" transparent={false} onRequestClose={() => setShowCategoryModal(false)}>
        <SafeAreaView style={styles.fullModal}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => { setShowCategoryModal(false); setShowCreateCategory(false); }}>
              <Feather name="x" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>Select Category</Text>
            <View style={{ width: 24 }} />
          </View>

          {!showCreateCategory ? (
            <>
              <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
                {filteredCategories.map((cat) => {
                  const isCustom = cat.user_id != null;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.listItem, selectedCategoryId === cat.id && styles.listItemSelected]}
                      onPress={() => { setSelectedCategoryId(cat.id); setSelectedSubCategoryId(''); setShowCategoryModal(false); }}
                    >
                      <View style={[styles.listItemIcon, { backgroundColor: cat.color + '20' }]}>
                        <Feather name={isCustom ? 'tag' : (getValidIconName(CategoryIcons[cat.name] || 'package'))} size={18} color={cat.color} />
                      </View>
                      <Text style={styles.listItemText}>{cat.name}</Text>
                      {isCustom && <View style={styles.customBadge}><Text style={styles.customBadgeText}>Custom</Text></View>}
                      {selectedCategoryId === cat.id && <Feather name="check" size={18} color={isCredit ? Colors.success : Colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.bottomAction}>
                <TouchableOpacity style={[styles.createNewBtn, isCredit && styles.createNewBtnIncome]} onPress={() => setShowCreateCategory(true)}>
                  <Feather name="plus" size={18} color="#FFF" />
                  <Text style={styles.createNewBtnText}>Create New Category</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <KeyboardAvoidingView style={styles.createForm} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <Text style={styles.createFormTitle}>Create {isCredit ? 'Income' : 'Expense'} Category</Text>
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
                  style={[styles.confirmBtn, (!newCategoryName.trim() || isCreating) && styles.confirmBtnDisabled, isCredit && styles.createNewBtnIncome]}
                  onPress={handleCreateNewCategory}
                  disabled={!newCategoryName.trim() || isCreating}
                >
                  {isCreating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Subcategory Selection Modal */}
      <Modal visible={showSubCategoryModal} animationType="slide" transparent={false} onRequestClose={() => setShowSubCategoryModal(false)}>
        <SafeAreaView style={styles.fullModal}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => { setShowSubCategoryModal(false); setShowCreateSubcategory(false); }}>
              <Feather name="x" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>Select Sub-Category</Text>
            <View style={{ width: 24 }} />
          </View>

          {!showCreateSubcategory ? (
            <>
              <ScrollView style={styles.fullModalScroll} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.listItem, !selectedSubCategoryId && styles.listItemSelected]}
                  onPress={() => { setSelectedSubCategoryId(''); setShowSubCategoryModal(false); }}
                >
                  <View style={[styles.listItemIcon, { backgroundColor: Colors.border }]}>
                    <Feather name="minus" size={18} color={Colors.textSecondary} />
                  </View>
                  <Text style={styles.listItemText}>None</Text>
                  {!selectedSubCategoryId && <Feather name="check" size={18} color={isCredit ? Colors.success : Colors.primary} />}
                </TouchableOpacity>

                {filteredSubCategories.length > 0 && <Text style={styles.sectionLabel}>Subcategories</Text>}
                {filteredSubCategories.map((sub) => (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.listItem, selectedSubCategoryId === sub.id && styles.listItemSelected]}
                    onPress={() => { setSelectedSubCategoryId(sub.id); setShowSubCategoryModal(false); }}
                    onLongPress={() => handleDeleteSubcategory(sub)}
                  >
                    <View style={[styles.listItemIcon, { backgroundColor: sub.color + '20' }]}>
                      <Feather name="tag" size={18} color={sub.color} />
                    </View>
                    <Text style={styles.listItemText}>{sub.name}</Text>
                    {selectedSubCategoryId === sub.id && <Feather name="check" size={18} color={isCredit ? Colors.success : Colors.primary} />}
                  </TouchableOpacity>
                ))}
                {filteredSubCategories.length === 0 && (
                  <View style={styles.emptyState}>
                    <Feather name="layers" size={40} color={Colors.textMuted} />
                    <Text style={styles.emptyStateText}>No subcategories yet</Text>
                  </View>
                )}
                {filteredSubCategories.length > 0 && <Text style={styles.deleteHint}>Long-press to delete</Text>}
              </ScrollView>
              <View style={styles.bottomAction}>
                <TouchableOpacity style={[styles.createNewBtn, isCredit && styles.createNewBtnIncome]} onPress={() => setShowCreateSubcategory(true)}>
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
                placeholder="e.g., Monthly, Bonus..."
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
                  style={[styles.confirmBtn, (!newSubcategoryName.trim() || isCreating) && styles.confirmBtnDisabled, isCredit && styles.createNewBtnIncome]}
                  onPress={handleCreateNewSubCategory}
                  disabled={!newSubcategoryName.trim() || isCreating}
                >
                  {isCreating ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.confirmBtnText}>Create</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouch: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    overflow: 'hidden',
  },

  // Header
  header: {
    padding: 20,
    paddingTop: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    top: -30,
    right: -20,
  },
  decorCircle2: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    bottom: -10,
    right: 60,
    opacity: 0.5,
  },
  headerContent: {
    alignItems: 'center',
  },
  transactionBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // Content
  content: {
    paddingHorizontal: 20,
  },

  // Amount Card
  amountCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
  },
  amountLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  accountInfo: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 10,
  },

  // Dropdown Style (Matching add-expense)
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  dropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  customBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.border,
    borderRadius: 4,
    marginRight: 8,
  },
  customBadgeText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // Payment Chips (Horizontal Scroll kept for payments as per visual preference usually, but can change if needed. Keeping as chips for now since issue was category nesting)
  categoryScroll: {
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  categoryChipSelected: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  categoryTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },

  // Note Input
  noteInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Actions
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },

  // Nested Modal Styles
  fullModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  fullModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  fullModalScroll: {
    flex: 1,
    padding: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 4,
  },
  listItemSelected: {
    backgroundColor: Colors.primary + '05',
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 8,
    borderBottomWidth: 0,
  },
  listItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 20,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  bottomAction: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  createNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  createNewBtnIncome: {
    backgroundColor: Colors.success,
  },
  createNewBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyStateText: {
    color: Colors.textMuted,
    fontSize: 16,
  },
  deleteHint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  // Creation Form inside Modal
  createForm: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  createFormTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  createFormInput: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  createFormActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
