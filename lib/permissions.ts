import { Platform, Linking, Alert, Dimensions, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { requestSMSPermission, checkSMSPermission } from './smsReader';
import { startSMSForegroundService } from './foregroundService';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';

import * as SecureStore from 'expo-secure-store';

// Package name for Android intent
const PACKAGE_NAME = Constants.expoConfig?.android?.package || 'com.devak_klm.expensetrackerapp';
const OVERLAY_PERMISSION_KEY = 'overlay_permission_requested';

/**
 * Check and request all required permissions
 */
export async function checkAndRequestAllPermissions() {
  if (Platform.OS !== 'android') return;

  console.log('Checking all permissions...');

  // 1. Notification Permission (Android 13+)
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Notification permission is needed to alert you about detected expenses.',
        [{ text: 'OK' }]
      );
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }

  // 2. SMS Permission
  try {
    const smsStatus = await checkSMSPermission();
    let smsGranted = false;
    
    if (!smsStatus.hasReadSmsPermission || !smsStatus.hasReceiveSmsPermission) {
      const granted = await requestSMSPermission();
      if (!granted) {
        Alert.alert(
          'SMS Permission Required',
          'SMS permission is required to detect bank transactions automatically.',
          [{ text: 'OK' }]
        );
      } else {
        smsGranted = true;
      }
    } else {
      smsGranted = true;
    }

    // Auto-start foreground service if permission is granted
    if (smsGranted) {
      console.log('SMS permission granted, starting foreground service...');
      await startSMSForegroundService();
    }

  } catch (error) {
    console.error('Error requesting SMS permission:', error);
  }

  // 3. Display Over Other Apps (Overlay) Permission
  try {
    const hasRequested = await SecureStore.getItemAsync(OVERLAY_PERMISSION_KEY);
    
    if (!hasRequested) {
      Alert.alert(
        'Enable "Display over other apps"',
        'To show expense popups immediately when you are using other apps, please enable "Allow display over other apps" for Expense Tracker.',
        [
          { text: 'Later', style: 'cancel' },
          { 
            text: 'Open Settings', 
            onPress: async () => {
              await SecureStore.setItemAsync(OVERLAY_PERMISSION_KEY, 'true');
              requestOverlayPermission();
            } 
          }
        ]
      );
    }
  } catch (error) {
    console.error('Error checking overlay permission status:', error);
  }
}

/**
 * Open Overlay Permission Settings
 */
export async function requestOverlayPermission() {
  if (Platform.OS !== 'android') return;

  Alert.alert(
    'Enable "Display over other apps"',
    'To show expense popups immediately when you are using other apps, please enable "Allow display over other apps" for Expense Tracker.',
    [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Open Settings', 
        onPress: async () => {
          if (Platform.OS === 'android') {
            try {
              // Try to open specific overlay permission screen
              // "android.settings.action.MANAGE_OVERLAY_PERMISSION"
              await IntentLauncher.startActivityAsync('android.settings.action.MANAGE_OVERLAY_PERMISSION', {
                  data: `package:${PACKAGE_NAME}`
              });
            } catch (e) {
              console.log('Error opening overlay settings, falling back:', e);
              Linking.openSettings();
            }
          } else {
            Linking.openSettings();
          }
        } 
      }
    ]
  );
}
