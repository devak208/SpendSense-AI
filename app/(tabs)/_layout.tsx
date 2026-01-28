import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, GestureResponderEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/Colors';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { getUserByClerkId, updateUserPushToken } from '@/lib/supabase';

// Custom center FAB button component
function CenterAddButton({ onPress }: { onPress?: (event: GestureResponderEvent) => void }) {
  return (
    <TouchableOpacity style={styles.centerButton} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.centerButtonInner}>
        <Feather name="plus" size={26} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      registerForNotifications();
    }
  }, [user]);

  const registerForNotifications = async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (token && user) {
        const dbUser = await getUserByClerkId(user.id);
        if (dbUser) {
          await updateUserPushToken(dbUser.id, token);
          console.log('Push token updated automatically');
        }
      }
    } catch (e) {
      console.error('Failed to register for notifications', e);
    }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <Feather name="clock" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add-expense"
        options={{
          title: '',
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <CenterAddButton onPress={props.onPress} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen name="add-debt" options={{ href: null }} />
      <Tabs.Screen name="debts" options={{ href: null }} />
      <Tabs.Screen name="summary" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: Colors.tabBarBorder,
    height: 65,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  centerButton: {
    top: -18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
