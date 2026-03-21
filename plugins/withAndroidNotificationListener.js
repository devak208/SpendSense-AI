const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidNotificationListener(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;
    const mainApplication = manifest.application[0];

    // Ensure tools namespace exists
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Add tools:replace="android:allowBackup" to prevent merger conflicts
    if (mainApplication.$['tools:replace']) {
      if (!mainApplication.$['tools:replace'].includes('android:allowBackup')) {
        mainApplication.$['tools:replace'] += ',android:allowBackup';
      }
    } else {
      mainApplication.$['tools:replace'] = 'android:allowBackup';
    }
    
    // Check if the service is already added
    const serviceExists = mainApplication.service?.some(
      (s) => s.$['android:name'] === 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener'
    );

    if (!serviceExists) {
      if (!mainApplication.service) {
        mainApplication.service = [];
      }

      mainApplication.service.push({
        '$': {
          'android:name': 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener',
          'android:label': '@string/app_name',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true'
        },
        'intent-filter': [{
          'action': [{
            '$': {
              'android:name': 'android.service.notification.NotificationListenerService'
            }
          }]
        }]
      });
    }

    return config;
  });
};
