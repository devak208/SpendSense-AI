import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/Colors';

// This route handles the OAuth callback redirect
// After Clerk processes the OAuth, redirect back to sign-in

export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    console.log('[OAuthCallback] Redirecting back to sign-in...');
    // Give a brief moment for OAuth to process, then go back to sign-in
    const timer = setTimeout(() => {
      router.replace('/sign-in');
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  text: {
    color: Colors.textSecondary,
    marginTop: 16,
    fontSize: 14,
  },
});
