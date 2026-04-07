import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { SMSTransactionProvider } from '@/context/SMSTransactionContext';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Clerk token cache using SecureStore
const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Custom theme for expense tracker
const ExpenseTrackerTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#0C6B58',
    background: '#000000',
    card: '#111111',
    text: '#FFFFFF',
    border: '#222222',
    notification: '#0C6B58',
  },
};

import '../lib/notifications'; // Ensure handler and channels are set up
import * as Notifications from 'expo-notifications';
import { checkAndRequestAllPermissions } from '@/lib/permissions';
import { registerSMSBackgroundService } from '@/lib/foregroundService';
import { registerNotificationListener, requestNotificationPermission } from '@/lib/notificationListener';
import notifee from '@notifee/react-native';

// Register the background service task
registerSMSBackgroundService();
registerNotificationListener();

// Register background event handler to silence warnings and handle actions
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('Notifee background event:', type, detail);
  // Actions are handled via launchActivity: 'default' which opens the app
});

function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  // Initial Permission Check — sequential to avoid dialog race conditions on first launch
  useEffect(() => {
    const runPermissions = async () => {
      // Wait for standard permissions (notifications, SMS, overlay) to fully complete
      await checkAndRequestAllPermissions();
      // Then ask for notification listener access (shows alert to open settings)
      await requestNotificationPermission();
    };
    runPermissions();
  }, []);

  // Debug: Listen for notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 NOTIFICATION RECEIVED (Foreground):', JSON.stringify(notification, null, 2));
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 NOTIFICATION TAPPED:', JSON.stringify(response, null, 2));
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // Handle OAuth callback and unmatched routes
  useEffect(() => {
    console.log('=== PATHNAME CHECK ===');
    console.log('Current pathname:', pathname);
    
    // If we're on the OAuth callback route, just wait - Clerk will handle it
    if (pathname?.includes('oauth-native-callback')) {
      console.log('On OAuth callback, waiting for Clerk...');
      return;
    }
  }, [pathname]);

  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
      setIsReady(true);
      console.log('=== CLERK LOADED ===');
      console.log('isSignedIn:', isSignedIn);
    }
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || !isReady) return;
    
    const currentSegment = segments[0];
    console.log('=== AUTH REDIRECT CHECK ===');
    console.log('Current segment:', currentSegment);
    console.log('isSignedIn:', isSignedIn);
    console.log('pathname:', pathname);

    // Ignore OAuth callback routes
    if (pathname?.includes('oauth') || pathname?.includes('callback')) {
      console.log('Ignoring OAuth/callback route');
      return;
    }

    const inTabsGroup = currentSegment === '(tabs)';
    const inAuthScreen = currentSegment === 'sign-in' || currentSegment === 'sign-up';

    if (isSignedIn && !inTabsGroup) {
      console.log('User signed in, redirecting to tabs...');
      router.replace('/(tabs)');
    } else if (!isSignedIn && !inAuthScreen) {
      console.log('User not signed in, redirecting to sign-in...');
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, segments, isReady, pathname]);

  if (!isLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C6B58" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  if (!publishableKey) {
    console.error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0C6B58" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ThemeProvider value={ExpenseTrackerTheme}>
          <SMSTransactionProvider>
            <AuthLayout />
          </SMSTransactionProvider>
          <StatusBar style="light" />
        </ThemeProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
});
