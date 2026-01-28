import { useAuth, useUser } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';

import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { updateUserPushToken, getUserByClerkId } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [notificationStatus, setNotificationStatus] = useState<string>('checking');

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    const settings = await Notifications.getPermissionsAsync();
    setNotificationStatus(settings.status);
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

  const menuItems = [
    { icon: 'file-text', title: 'Debts & Reminders', onPress: () => router.push('/(tabs)/debts') },
    { icon: 'pie-chart', title: 'Monthly Summary', onPress: () => router.push('/(tabs)/summary') },
    { 
      icon: 'bell', 
      title: notificationStatus === 'granted' ? 'Notifications Enabled' : 'Enable Notifications', 
      onPress: handleEnableNotifications 
    },
    { 
      icon: 'smartphone', 
      title: 'Test Notification', 
      onPress: handleTestNotification 
    },
    { icon: 'shield', title: 'Privacy', onPress: () => {} },
    { icon: 'help-circle', title: 'Help & Support', onPress: () => {} },
    { icon: 'info', title: 'About', onPress: () => {} },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="user" size={40} color={Colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user?.fullName || user?.firstName || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.primaryEmailAddress?.emailAddress}</Text>
          <Text style={{ color: Colors.textSecondary, marginTop: 4, fontSize: 12 }}>
            Notifications: {notificationStatus}
          </Text>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconContainer}>
                <Feather name={item.icon as any} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Feather name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Feather name="log-out" size={20} color={Colors.error} />
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
  header: {
    padding: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  profileCard: {
    alignItems: 'center',
    padding: 28,
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: Colors.card,
    borderRadius: 24,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  menuSection: {
    marginHorizontal: 24,
    backgroundColor: Colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    marginTop: 24,
    padding: 18,
    backgroundColor: Colors.errorLight,
    borderRadius: 20,
    gap: 10,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error,
  },
  footer: {
    alignItems: 'center',
    padding: 32,
    paddingBottom: 120,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
