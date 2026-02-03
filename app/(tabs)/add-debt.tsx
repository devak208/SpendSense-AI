import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/Colors';
import { createDebt, createReminder, getUserByClerkId } from '@/lib/supabase';

const DEBT_TYPES = [
  { id: 'rent', label: 'Rent', icon: 'home' },
  { id: 'loan', label: 'Loan', icon: 'dollar-sign' },
  { id: 'subscription', label: 'Subscription', icon: 'repeat' },
  { id: 'emi', label: 'EMI', icon: 'credit-card' },
  { id: 'other', label: 'Other', icon: 'file-text' },
];

const REMINDER_SCHEDULES = [
  { id: 'once', label: 'Once' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AddDebtScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const { initialDirection } = useLocalSearchParams();

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [debtType, setDebtType] = useState('other');
  const [direction, setDirection] = useState<'owed' | 'receivable'>((initialDirection as 'owed' | 'receivable') || 'owed');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderSchedule, setReminderSchedule] = useState('once');
  const [reminderDayOfWeek, setReminderDayOfWeek] = useState(1);
  const [reminderDayOfMonth, setReminderDayOfMonth] = useState(1);
  const [reminderTime, setReminderTime] = useState(new Date(2000, 0, 1, 9, 0));
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { initUser(); }, [userId]);

  const initUser = async () => {
    if (!userId) return;
    try {
      const user = await getUserByClerkId(userId);
      setDbUserId(user?.id || null);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleSave = async () => {
    if (!name || !amount || !dbUserId) {
      Alert.alert('Error', 'Please fill in name and amount');
      return;
    }

    const amountNum = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      const timeStr = `${String(reminderTime.getHours()).padStart(2, '0')}:${String(reminderTime.getMinutes()).padStart(2, '0')}:00`;

      const debt = await createDebt({
        user_id: dbUserId,
        name,
        description: description || undefined,
        amount: amountNum,
        debt_type: debtType,
        direction,
        due_date: dueDate?.toISOString().split('T')[0],
        is_recurring: reminderSchedule !== 'once' && reminderEnabled,
        reminder_enabled: reminderEnabled,
        reminder_schedule: reminderEnabled ? reminderSchedule : undefined,
        reminder_day_of_week: reminderEnabled && reminderSchedule === 'weekly' ? reminderDayOfWeek : undefined,
        reminder_day_of_month: reminderEnabled && reminderSchedule === 'monthly' ? reminderDayOfMonth : undefined,
        reminder_time: reminderEnabled ? timeStr : undefined,
      });

      if (reminderEnabled && debt.id) {
        const scheduledFor = calculateNextReminderDate();
        if (scheduledFor) {
          await createReminder({
            debt_id: debt.id,
            user_id: dbUserId,
            scheduled_for: scheduledFor.toISOString(),
          });
        }
      }

      Alert.alert('Success', 'Debt added!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const calculateNextReminderDate = (): Date | null => {
    const now = new Date();
    const result = new Date(now);
    result.setHours(reminderTime.getHours(), reminderTime.getMinutes(), 0, 0);

    switch (reminderSchedule) {
      case 'once':
        if (result <= now) result.setDate(result.getDate() + 1);
        break;
      case 'daily':
        if (result <= now) result.setDate(result.getDate() + 1);
        break;
      case 'weekly':
        const daysUntil = (7 + reminderDayOfWeek - now.getDay()) % 7 || 7;
        result.setDate(result.getDate() + daysUntil);
        break;
      case 'monthly':
        result.setDate(reminderDayOfMonth);
        if (result <= now) result.setMonth(result.getMonth() + 1);
        break;
    }
    return result;
  };

  const getReminderSummary = (): string => {
    const timeStr = reminderTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    switch (reminderSchedule) {
      case 'once':
        return `One-time at ${timeStr}`;
      case 'daily':
        return `Daily at ${timeStr}`;
      case 'weekly':
        return `Every ${DAYS_OF_WEEK[reminderDayOfWeek]} at ${timeStr}`;
      case 'monthly':
        const suffix = reminderDayOfMonth === 1 ? 'st' : reminderDayOfMonth === 2 ? 'nd' : reminderDayOfMonth === 3 ? 'rd' : 'th';
        return `${reminderDayOfMonth}${suffix} of month at ${timeStr}`;
      default:
        return '';
    }
  };

  const isOwed = direction === 'owed';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header with Gradient */}
        <LinearGradient
          colors={[isOwed ? Colors.errorLight : Colors.successLight, Colors.background]}
          style={styles.headerGradient}
        >
          {/* Back Button */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Feather name="arrow-left" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Add Debt/Bill</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Decorative Card */}
          <View style={styles.featureCard}>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                {isOwed ? (
                  <><Text style={{ color: Colors.error }}>Track</Text> what you owe</>
                ) : (
                  <><Text style={{ color: Colors.success }}>Track</Text> what's owed to you</>
                )}
              </Text>
              <Text style={styles.featureSubtitle}>Add reminders to never miss a payment</Text>
            </View>
            <View style={styles.featureDecor}>
              <View style={[styles.decorCircle1, !isOwed && { backgroundColor: Colors.successLight }]} />
              <View style={[styles.decorCircle2, !isOwed && { backgroundColor: Colors.successLight }]} />
              <View style={styles.decorIcon}>
                <Feather name={isOwed ? 'arrow-up-right' : 'arrow-down-left'} size={20} color={isOwed ? Colors.error : Colors.success} />
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.form}>
          {/* Direction Toggle */}
          <View style={styles.toggleWrapper}>
            <View style={styles.toggleTrack}>
              <TouchableOpacity
                style={[styles.toggleOption, isOwed && styles.toggleOptionOwedActive]}
                onPress={() => setDirection('owed')}
              >
                <Feather name="arrow-up-right" size={14} color={isOwed ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.toggleLabel, isOwed && styles.toggleLabelActive]}>I Owe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleOption, !isOwed && styles.toggleOptionReceivableActive]}
                onPress={() => setDirection('receivable')}
              >
                <Feather name="arrow-down-left" size={14} color={!isOwed ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.toggleLabel, !isOwed && styles.toggleLabelActive]}>Owed to Me</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Name */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., House Rent, Netflix"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <View style={[styles.amountContainer, !isOwed && { borderColor: Colors.success + '40' }]}>
              <Text style={[styles.currencySymbol, !isOwed && { color: Colors.success }]}>
                {isOwed ? '-' : '+'} ₹
              </Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.typeGrid}>
              {DEBT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[styles.typeItem, debtType === type.id && styles.typeItemActive]}
                  onPress={() => setDebtType(type.id)}
                >
                  <Feather
                    name={type.icon as any}
                    size={16}
                    color={debtType === type.id ? '#FFFFFF' : Colors.textSecondary}
                  />
                  <Text style={[styles.typeText, debtType === type.id && styles.typeTextActive]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Due Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Due Date (Optional)</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity 
                style={styles.dateButton} 
                onPress={() => setShowDatePicker(true)}
              >
                <View style={[styles.dateIcon, { backgroundColor: Colors.goldLight }]}>
                  <Feather name="calendar" size={16} color={Colors.gold} />
                </View>
                <Text style={[styles.dateText, !dueDate && styles.dateTextPlaceholder]}>
                  {dueDate ? dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                </Text>
                <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
              {dueDate && (
                <TouchableOpacity 
                  style={styles.clearButton} 
                  onPress={() => setDueDate(null)}
                >
                  <Feather name="x" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={dueDate || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setDueDate(date);
                }}
                themeVariant="light"
              />
            )}
          </View>

          {/* Reminder Section */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderHeaderLeft}>
                <View style={[styles.bellIcon, reminderEnabled && { backgroundColor: Colors.goldLight }]}>
                  <Feather name="bell" size={16} color={reminderEnabled ? Colors.gold : Colors.textSecondary} />
                </View>
                <View>
                  <Text style={[styles.reminderTitle, reminderEnabled && { color: Colors.gold }]}>Reminder</Text>
                  <Text style={styles.reminderSubtitle}>Get notified before due</Text>
                </View>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: Colors.border, true: Colors.gold }}
                thumbColor={'#FFF'}
              />
            </View>

            {reminderEnabled && (
              <View style={styles.reminderSettings}>
                {/* Summary Preview */}
                <View style={styles.reminderSummaryBox}>
                  <Feather name="clock" size={14} color={Colors.gold} />
                  <Text style={styles.reminderSummaryText}>{getReminderSummary()}</Text>
                  {reminderSchedule !== 'once' && (
                    <View style={styles.repeatingBadge}>
                      <Feather name="repeat" size={10} color={Colors.success} />
                    </View>
                  )}
                </View>

                <Text style={styles.subLabel}>Frequency</Text>
                <View style={styles.scheduleRow}>
                  {REMINDER_SCHEDULES.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.scheduleChip, reminderSchedule === s.id && styles.scheduleChipActive]}
                      onPress={() => setReminderSchedule(s.id)}
                    >
                      <Text style={[styles.scheduleText, reminderSchedule === s.id && styles.scheduleTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {reminderSchedule === 'weekly' && (
                  <>
                    <Text style={styles.subLabel}>Day of Week</Text>
                    <View style={styles.daysRow}>
                      {DAYS_OF_WEEK.map((d, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.dayChip, reminderDayOfWeek === i && styles.dayChipActive]}
                          onPress={() => setReminderDayOfWeek(i)}
                        >
                          <Text style={[styles.dayText, reminderDayOfWeek === i && styles.dayTextActive]}>
                            {d}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {reminderSchedule === 'monthly' && (
                  <>
                    <Text style={styles.subLabel}>Day of Month</Text>
                    <View style={styles.daysRow}>
                      {[1, 5, 10, 15, 20, 25, 28].map((day) => (
                        <TouchableOpacity
                          key={day}
                          style={[styles.dayChip, reminderDayOfMonth === day && styles.dayChipActive]}
                          onPress={() => setReminderDayOfMonth(day)}
                        >
                          <Text style={[styles.dayText, reminderDayOfMonth === day && styles.dayTextActive]}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <Text style={styles.subLabel}>Time</Text>
                <TouchableOpacity style={styles.timeButton} onPress={() => setShowTimePicker(true)}>
                  <Feather name="clock" size={16} color={Colors.gold} />
                  <Text style={styles.timeText}>
                    {reminderTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={reminderTime}
                    mode="time"
                    display="spinner"
                    onChange={(e, time) => {
                      setShowTimePicker(Platform.OS === 'ios');
                      if (time) setReminderTime(time);
                    }}
                    themeVariant="light"
                  />
                )}
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Add any notes..."
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Feather name="check" size={18} color="#FFFFFF" />
                <Text style={styles.saveText}>Save Debt</Text>
                <Text style={styles.saveChevron}>»</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: Colors.textPrimary 
  },

  // Decorative Card
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
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 6,
  },
  toggleOptionOwedActive: {
    backgroundColor: Colors.error,
  },
  toggleOptionReceivableActive: {
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
  subLabel: { 
    fontSize: 11, 
    color: Colors.textSecondary, 
    marginBottom: 8,
    marginTop: 12,
  },

  input: { 
    backgroundColor: Colors.card, 
    borderRadius: 12, 
    padding: 14, 
    fontSize: 14, 
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Amount
  amountContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: Colors.card, 
    borderRadius: 14, 
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currencySymbol: { 
    fontSize: 22, 
    fontWeight: '600',
    color: Colors.error, 
    marginRight: 4 
  },
  amountInput: { 
    fontSize: 28, 
    fontWeight: '700', 
    color: Colors.textPrimary, 
    paddingVertical: 14,
    minWidth: 80,
    textAlign: 'center',
  },

  // Type Grid
  typeGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8 
  },
  typeItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.card, 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeItemActive: { 
    backgroundColor: Colors.secondary, 
    borderColor: Colors.secondary,
  },
  typeText: { 
    fontSize: 12, 
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  typeTextActive: { 
    color: '#FFFFFF' 
  },

  // Date
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateButton: { 
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.card, 
    borderRadius: 12, 
    padding: 12, 
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateText: { 
    flex: 1,
    fontSize: 14, 
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  dateTextPlaceholder: { 
    color: Colors.textMuted 
  },
  clearButton: { 
    backgroundColor: Colors.card, 
    padding: 10, 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Reminder Card
  reminderCard: { 
    backgroundColor: Colors.card, 
    borderRadius: 14, 
    padding: 16, 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  reminderHeaderLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12 
  },
  bellIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderTitle: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: Colors.textSecondary 
  },
  reminderSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  reminderSettings: { 
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  reminderSummaryBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.goldLight, 
    borderRadius: 10, 
    padding: 12, 
    gap: 8,
  },
  reminderSummaryText: { 
    flex: 1,
    fontSize: 13, 
    color: Colors.textPrimary, 
    fontWeight: '500' 
  },
  repeatingBadge: { 
    backgroundColor: Colors.successLight, 
    borderRadius: 6, 
    padding: 4,
  },

  // Schedule Row
  scheduleRow: { 
    flexDirection: 'row', 
    gap: 8,
    flexWrap: 'wrap',
  },
  scheduleChip: { 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    backgroundColor: Colors.background, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scheduleChipActive: { 
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  scheduleText: { 
    fontSize: 12, 
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  scheduleTextActive: { 
    color: '#FFFFFF' 
  },

  // Days Row
  daysRow: { 
    flexDirection: 'row', 
    gap: 6, 
    flexWrap: 'wrap' 
  },
  dayChip: { 
    paddingHorizontal: 10, 
    paddingVertical: 8, 
    backgroundColor: Colors.background, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayChipActive: { 
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  dayText: { 
    fontSize: 11, 
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  dayTextActive: { 
    color: '#FFFFFF' 
  },

  // Time Button
  timeButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.background, 
    borderRadius: 10, 
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    gap: 8, 
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeText: { 
    fontSize: 14, 
    color: Colors.textPrimary, 
    fontWeight: '500' 
  },

  // Save Button
  saveButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: Colors.secondary, 
    borderRadius: 10, 
    padding: 14, 
    gap: 8, 
    marginTop: 20 
  },
  saveButtonDisabled: { 
    opacity: 0.7 
  },
  saveText: { 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#FFFFFF' 
  },
  saveChevron: {
    fontSize: 16,
    color: '#FFF',
    marginLeft: 2,
  },
});
