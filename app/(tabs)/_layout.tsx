import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, GestureResponderEvent, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';

import { Colors } from '@/constants/Colors';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { getUserByClerkId, updateUserPushToken } from '@/lib/supabase';

// Animated Tab Icon component
function AnimatedTabIcon({ 
  name, 
  color, 
  focused 
}: { 
  name: string; 
  color: string; 
  focused: boolean; 
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(focused ? 1 : 0.7)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1.15,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.6,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
      <Feather name={name as any} size={22} color={color} />
    </Animated.View>
  );
}

// Custom center FAB button component with animation
function CenterAddButton({ onPress }: { onPress?: (event: GestureResponderEvent) => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity 
      style={styles.centerButton} 
      onPress={onPress} 
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.centerButtonInner, { transform: [{ scale: scaleAnim }] }]}>
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { user } = useUser();
  const router = useRouter();

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
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerShown: true, // Enable global header
        headerStyle: {
          backgroundColor: Colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
          color: Colors.textPrimary,
        },
        headerRight: () => (
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/debts')}
            style={{ marginRight: 20 }}
          >
            <Feather name="bell" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false, // Keep custom header for Home
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'History',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="clock" color={color} focused={focused} />
          ),
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
        name="budgets"
        options={{
          title: 'Budgets',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="target" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="message-circle" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon name="user" color={color} focused={focused} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen name="add-debt" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="debts" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="summary" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 85,
    paddingBottom: 25,
    paddingTop: 10,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  tabBarItem: {
    paddingTop: 4,
  },
  centerButton: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
});
