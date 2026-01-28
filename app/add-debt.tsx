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

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [debtType, setDebtType] = useState('other');
  const { initialDirection } = useLocalSearchParams();
  const [direction, setDirection] = useState<'owed' | 'receivable'>((initialDirection as 'owed' | 'receivable') || 'owed');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderSchedule, setReminderSchedule] = useState('once');
  const [reminderDayOfWeek, setReminderDayOfWeek] = useState(1); // Monday
  const [reminderDayOfMonth, setReminderDayOfMonth] = useState(1);
  const [reminderTime, setReminderTime] = useState(new Date(2000, 0, 1, 9, 0)); // 9:00 AM
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    initUser();
  }, [userId]);

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
        amount: amountNum,
        debt_type: debtType,
        direction,
        due_date: dueDate?.toISOString().split('T')[0],
        is_recurring: isRecurring,
        reminder_enabled: reminderEnabled,
        reminder_schedule: reminderEnabled ? reminderSchedule : undefined,
        reminder_day_of_week: reminderEnabled && reminderSchedule === 'weekly' ? reminderDayOfWeek : undefined,
        reminder_day_of_month: reminderEnabled && reminderSchedule === 'monthly' ? reminderDayOfMonth : undefined,
        reminder_time: reminderEnabled ? timeStr : undefined,
      });

      // Create initial reminder if enabled
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
      case 'once':
        // If time passed today, schedule for tomorrow? Or just keep today if it's in future?
        // User request "once like that", implying a specific single time.
        // If the calculated time for today is in the past, move it to tomorrow?
        // Let's assume 'Once' means the next occurrence of this time.
        if (result <= now) result.setDate(result.getDate() + 1);
        break;
    }
    return result;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Add Debt/Bill</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Direction Toggle */}
        <View style={styles.directionToggle}>
          <TouchableOpacity
            style={[styles.directionBtn, direction === 'owed' && styles.directionBtnActive]}
            onPress={() => setDirection('owed')}
          >
            <Text style={[styles.directionText, direction === 'owed' && styles.directionTextActive]}>
              I Owe
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.directionBtn, direction === 'receivable' && styles.directionBtnActive]}
            onPress={() => setDirection('receivable')}
          >
            <Text style={[styles.directionText, direction === 'receivable' && styles.directionTextActive]}>
              Owed to Me
            </Text>
          </TouchableOpacity>
        </View>

        {/* Name */}
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., House Rent, Netflix"
            placeholderTextColor={Colors.textSecondary}
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* Amount */}
        <View style={styles.section}>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.currency}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor={Colors.textSecondary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeGrid}>
            {DEBT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeItem, debtType === type.id && styles.typeItemActive]}
                onPress={() => setDebtType(type.id)}
              >
                <Feather
                  name={type.icon as any}
                  size={20}
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
          <Text style={styles.label}>Due Date (Optional)</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Feather name="calendar" size={20} color={Colors.textSecondary} />
            <Text style={styles.dateText}>
              {dueDate ? dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
            </Text>
          </TouchableOpacity>
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

        {/* Recurring */}
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Recurring</Text>
            <Text style={styles.switchHint}>This repeats every month</Text>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.textPrimary}
          />
        </View>

        {/* Reminder */}
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Reminder</Text>
            <Text style={styles.switchHint}>Get notified about this</Text>
          </View>
          <Switch
            value={reminderEnabled}
            onValueChange={setReminderEnabled}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={Colors.textPrimary}
          />
        </View>

        {/* Reminder Settings */}
        {reminderEnabled && (
          <View style={styles.reminderSettings}>
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
                <TextInput
                  style={[styles.input, { width: 100 }]}
                  value={String(reminderDayOfMonth)}
                  onChangeText={(t) => setReminderDayOfMonth(Math.min(31, Math.max(1, parseInt(t) || 1)))}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </>
            )}

            <Text style={styles.subLabel}>Time</Text>
            <TouchableOpacity style={styles.timeButton} onPress={() => setShowTimePicker(true)}>
              <Feather name="clock" size={18} color={Colors.textSecondary} />
              <Text style={styles.timeText}>
                {reminderTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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

        {/* Description */}


        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <>
              <Feather name="check" size={20} color="#FFFFFF" />
              <Text style={styles.saveText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  directionToggle: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 12, padding: 4, marginBottom: 24 },
  directionBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  directionBtnActive: { backgroundColor: Colors.primary },
  directionText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  directionTextActive: { color: '#FFFFFF' },
  section: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase' },
  subLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, fontSize: 16, color: Colors.textPrimary },
  amountContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16 },
  currency: { fontSize: 24, color: Colors.textSecondary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, paddingVertical: 16 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  typeItemActive: { backgroundColor: Colors.primary },
  typeText: { fontSize: 13, color: Colors.textSecondary },
  typeTextActive: { color: '#FFFFFF' },
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 16, gap: 12 },
  dateText: { fontSize: 16, color: Colors.textPrimary },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  switchLabel: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  switchHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  reminderSettings: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginTop: 16 },
  scheduleRow: { flexDirection: 'row', gap: 10 },
  scheduleChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.background, borderRadius: 20 },
  scheduleChipActive: { backgroundColor: Colors.primary },
  scheduleText: { fontSize: 14, color: Colors.textSecondary },
  scheduleTextActive: { color: '#FFFFFF', fontWeight: '600' },
  daysRow: { flexDirection: 'row', gap: 6 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: Colors.background, borderRadius: 8 },
  dayChipActive: { backgroundColor: Colors.primary },
  dayText: { fontSize: 12, color: Colors.textSecondary },
  dayTextActive: { color: '#FFFFFF', fontWeight: '600' },
  timeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, gap: 10, alignSelf: 'flex-start' },
  timeText: { fontSize: 16, color: Colors.textPrimary },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 16, padding: 18, gap: 8, marginTop: 24 },
  saveButtonDisabled: { opacity: 0.7 },
  saveText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
