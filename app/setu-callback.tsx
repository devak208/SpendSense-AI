import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Feather } from '@expo/vector-icons';

export default function SetuCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  useEffect(() => {
    // Expected params: success, status, consentId (depends on Setu response usually)
    // Actually Setu redirect params are often: ?success=true&id=...
    console.log('Setu Callback Params:', params);

    const checkStatus = async () => {
      // Simulate verification delay
      setTimeout(() => {
        if (params.success === 'true' || params.status === 'S') {
           // Success
           router.replace({
             pathname: '/profile',
             params: { setuLinkStatus: 'success' }
           });
        } else {
           // Failed or User Cancelled
           router.replace({
             pathname: '/profile',
             params: { setuLinkStatus: 'failed' }
           });
        }
      }, 2000);
    };

    checkStatus();
  }, [params]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text}>Verifying Bank Link...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  text: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  }
});
