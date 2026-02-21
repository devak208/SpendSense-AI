import { useAuth, useUser } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/Colors';

import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { updateUserPushToken, getUserByClerkId } from '@/lib/supabase';
import { useSMSTransaction } from '@/context/SMSTransactionContext';
import * as Notifications from 'expo-notifications';
import { useEffect, useState, useRef } from 'react';

// Skeleton Component
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

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [notificationStatus, setNotificationStatus] = useState<string>('checking');
  const [loading, setLoading] = useState(true);

  // SMS Transaction Detection
  const {
    isEnabled: smsEnabled,
    isSupported: smsSupported,
    hasPermission: smsHasPermission,
    enableSMSDetection,
    disableSMSDetection,
    testParsing,
    getHistory,
    clearHistory
  } = useSMSTransaction();

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    const settings = await Notifications.getPermissionsAsync();
    setNotificationStatus(settings.status);
    setLoading(false);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/sign-in');
          }
        },
      ]
    );
  };

  const handleEnableNotifications = async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        const dbUser = await getUserByClerkId(user?.id!);
        if (dbUser) {
          await updateUserPushToken(dbUser.id, token);
          Alert.alert('Success', 'Notifications enabled!');
          setNotificationStatus('granted');
        } else {
          Alert.alert('Error', 'User not found in database');
        }
      } else {
        Alert.alert('Error', 'Failed to get push token. Please check settings.');
        setNotificationStatus('denied');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Something went wrong');
    }
  };

  const handleTestNotification = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Test Notification",
        body: "This is a test reminder! 🔔",
      },
      trigger: null,
    });
  };

  // Handle SMS detection toggle
  const handleToggleSMSDetection = async () => {
    if (smsEnabled) {
      Alert.alert(
        'SMS Detection Active',
        'SMS detection is running in the background to catch transactions.',
        [{ text: 'OK' }]
      );
      return;
    }

    const success = await enableSMSDetection();
    if (success) {
      Alert.alert(
        'SMS Detection Enabled',
        'Bank transaction messages will now be detected automatically.',
        [{ text: 'OK' }]
      );
    }
  };

  // Test SMS parsing function (for debugging)
  const handleTestSMSParsing = () => {
    // Test with the BOI SMS format provided by user
    const testSender = 'BOI';
    const testMessage = 'Rs.1.00 debited A/cXX0983 and credited to sabeshragav289-1@okaxis via UPI Ref No 602967392852 on 29Jan26. Call 18001031906, if not done by you. -BOI';

    console.log('\n========== TESTING SMS PARSING ==========');
    const result = testParsing(testSender, testMessage);

    if (result) {
      Alert.alert(
        '✅ SMS Parsed Successfully',
        `Type: ${result.type}\nAmount: ₹${result.amount}\nBank: ${result.bankName || 'Unknown'}\nAccount: ****${result.accountLast4 || 'N/A'}\nMerchant: ${result.merchant || 'N/A'}`,
        [
          { text: 'Show Raw', onPress: () => Alert.alert('Raw Result', JSON.stringify(result, null, 2)) },
          { text: 'OK' }
        ]
      );
    } else {
      Alert.alert(
        '❌ Parsing Failed',
        'The SMS was not recognized as a bank transaction.\n\nCheck the console logs for details.',
        [{ text: 'OK' }]
      );
    }
  };

  // Show SMS History (for debugging)
  const handleShowSMSHistory = () => {
    const history = getHistory();
    if (history.length === 0) {
      Alert.alert('No SMS History', 'No SMS messages have been received yet. Enable SMS detection first.');
      return;
    }

    const summary = history.slice(0, 5).map((h, i) =>
      `${i + 1}. ${h.sender || 'Unknown'} - ${h.parsed ? (h.transaction ? '✅ Bank' : '⏭️ Ignored') : '❌ Error'}`
    ).join('\n');

    Alert.alert(
      `SMS History (${history.length} total)`,
      summary + (history.length > 5 ? `\n...and ${history.length - 5} more` : ''),
      [
        { text: 'Clear', onPress: clearHistory, style: 'destructive' },
        { text: 'OK' }
      ]
    );
  };

  const menuItems = [
    { icon: 'file-text', title: 'Debts & Reminders', subtitle: 'Manage your debts', onPress: () => router.push('/(tabs)/debts') },
    { icon: 'pie-chart', title: 'Monthly Summary', subtitle: 'View spending insights', onPress: () => router.push('/(tabs)/summary') },
    {
      icon: 'bell',
      title: notificationStatus === 'granted' ? 'Notifications Enabled' : 'Enable Notifications',
      subtitle: notificationStatus === 'granted' ? 'You will receive reminders' : 'Get reminded of due payments',
      onPress: handleEnableNotifications
    },
    {
      icon: 'zap',
      title: 'Test Notification',
      subtitle: 'Send a test reminder',
      onPress: handleTestNotification
    },
    // SMS Detection toggle (Android only)
    ...(Platform.OS === 'android' ? [
      {
        icon: 'message-square',
        title: smsEnabled ? 'SMS Detection On' : 'Auto-Detect Bank SMS',
        subtitle: smsEnabled
          ? 'Tap to disable auto-detection'
          : smsSupported
            ? 'Auto-add expenses from bank SMS'
            : 'Only available on Android',
        onPress: handleToggleSMSDetection,
        isEnabled: smsEnabled,
        showBadge: smsEnabled,
      },
      // Debug: Test SMS Parsing
      {
        icon: 'code',
        title: '🧪 Test SMS Parsing',
        subtitle: 'Test with sample BOI message',
        onPress: handleTestSMSParsing,
      },
      // Debug: View SMS History
      {
        icon: 'list',
        title: '📋 SMS History',
        subtitle: 'View received SMS log',
        onPress: handleShowSMSHistory,
      },
    ] : []),
  ];

  const settingsItems = [
    { icon: 'shield', title: 'Privacy', subtitle: 'Manage your data' },
    { icon: 'help-circle', title: 'Help & Support', subtitle: 'Get help with the app' },
    { icon: 'info', title: 'About', subtitle: 'App version and info' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header with Gradient */}
        <LinearGradient
          colors={[Colors.primaryMuted, Colors.background]}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/debts')}
              style={styles.headerButton}
            >
              <Feather name="bell" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Decorative Feature Card */}
          <View style={styles.featureCard}>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>
                <Text style={{ color: Colors.primary }}>Manage</Text> your account
              </Text>
              <Text style={styles.featureSubtitle}>Settings, notifications & more</Text>
            </View>
            <View style={styles.featureDecor}>
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />
              <View style={styles.decorIcon}>
                <Feather name="settings" size={22} color={Colors.primary} />
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="user" size={32} color={Colors.primary} />
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{user?.fullName || user?.firstName || 'User'}</Text>
            <Text style={styles.userEmail}>{user?.primaryEmailAddress?.emailAddress}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            notificationStatus === 'granted' ? styles.statusBadgeSuccess : styles.statusBadgeWarning
          ]}>
            <Feather
              name={notificationStatus === 'granted' ? 'bell' : 'bell-off'}
              size={12}
              color={notificationStatus === 'granted' ? Colors.success : Colors.gold}
            />
            <Text style={[
              styles.statusText,
              notificationStatus === 'granted' ? styles.statusTextSuccess : styles.statusTextWarning
            ]}>
              {notificationStatus === 'granted' ? 'Notifications On' : 'Notifications Off'}
            </Text>
          </View>
        </View>

        {/* Bank Integration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bank Integration</Text>
          <View style={styles.menuSection}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                try {
                  setLoading(true);
                  // Use Supabase/Backend to get correct phone or ask user? 
                  // For MVP, we send the Clerk User ID. Backend will look up or we pass dummy for now if needed.
                  // Typically AA requires mobile number matching the bank.
                  // Only proceed if we have user ID.

                  // NOTE: In production, you might want to prompt for phone number if not stored.
                  const mobileNumber = user?.primaryPhoneNumber?.phoneNumber || '9876543210';

                  const API_URL = 'http://192.168.31.169:3000';
                  const res = await fetch(`${API_URL}/api/setu/consent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: user?.id,
                      mobileNumber
                    })
                  });

                  const data = await res.json();
                  if (data.url) {
                    await Linking.openURL(data.url);
                  } else {
                    Alert.alert('Error', 'Failed to generate bank link URL');
                  }
                } catch (e) {
                  Alert.alert('Error', 'Connection failed');
                } finally {
                  setLoading(false);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: Colors.successLight }]}>
                <Feather name="link" size={18} color={Colors.success} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Connect Bank Account</Text>
                <Text style={styles.menuSubtitle}>Link via Account Aggregator</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.menuSection}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.menuItem, index === menuItems.length - 1 && styles.menuItemLast]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.menuIconContainer}>
                  <Feather name={item.icon as any} size={18} color={Colors.primary} />
                </View>
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.menuSection}>
            {settingsItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.menuItem, index === settingsItems.length - 1 && styles.menuItemLast]}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: Colors.border }]}>
                  <Feather name={item.icon as any} size={18} color={Colors.textSecondary} />
                </View>
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Feather name="log-out" size={18} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Expense Tracker v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Header with Gradient
  headerGradient: {
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
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
    backgroundColor: Colors.primaryMuted,
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

  // Profile Card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  userEmail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeSuccess: {
    backgroundColor: Colors.successLight,
  },
  statusBadgeWarning: {
    backgroundColor: Colors.goldLight,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusTextSuccess: {
    color: Colors.success,
  },
  statusTextWarning: {
    color: Colors.gold,
  },

  // Section
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  menuSection: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  menuSubtitle: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // Sign Out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 24,
    padding: 14,
    backgroundColor: Colors.errorLight,
    borderRadius: 10,
    gap: 8,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
