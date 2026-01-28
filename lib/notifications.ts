import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Set notification handler for foreground behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  console.log('Registering for push notifications...');
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    // We return null but app should handle it gracefully
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('Existing notification status:', existingStatus);
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    console.log('Requesting notification permissions...');
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('New notification status:', finalStatus);
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return null;
  }

  // Get projectId if available (needed for managed workflow sometimes)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  
  console.log('Project ID for notifications:', projectId);

  try {
    const pushTokenString = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
    console.log('Push Token:', pushTokenString);
    return pushTokenString;
  } catch (e) {
    console.error('Error getting push token:', e);
    return null;
  }
}
