import { useSignIn, useOAuth, useAuth, useUser } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useCallback, useState, useEffect } from 'react';
import { Colors } from '@/constants/Colors';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = 'https://test-backend-theta-one.vercel.app';

export const useWarmUpBrowser = () => {
  useEffect(() => {
    // Warm up the android browser to improve UX
    // https://docs.expo.dev/guides/authentication/#improving-user-experience
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

WebBrowser.maybeCompleteAuthSession();

// Store user in database after successful auth
async function storeUserInDatabase(user: any) {
  try {
    console.log('[SignIn] Storing user in database:', user.id);
    const response = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clerk_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || '',
        name: user.fullName || user.firstName || 'User',
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('[SignIn] User stored:', data);
    } else {
      console.log('[SignIn] User store response:', response.status);
    }
  } catch (err) {
    console.error('[SignIn] Failed to store user:', err);
  }
}

export default function SignInScreen() {
  useWarmUpBrowser();

  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSignedIn && user) {
      storeUserInDatabase(user);
      router.replace('/(tabs)');
    }
  }, [isSignedIn, user]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const { createdSessionId, setActive: oauthSetActive, signUp } = await startOAuthFlow({
        redirectUrl: Linking.createURL('/oauth-native-callback', { scheme: 'expensetrackerapp' }),
      });

      if (createdSessionId) {
        await oauthSetActive!({ session: createdSessionId });
      } else {
        // Use signIn or signUp for next steps such as MFA
        setError('Sign in failed. Please try again.');
      }
    } catch (err: any) {
      console.error('OAuth error:', JSON.stringify(err, null, 2));
      setError(err.errors?.[0]?.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  }, [startOAuthFlow]);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Feather name="credit-card" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.form}>
          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading}>
            <Feather name="chrome" size={20} color="#FFF" />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="your@email.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} placeholder="Your password" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/sign-up" asChild>
            <TouchableOpacity><Text style={styles.linkText}>Sign Up</Text></TouchableOpacity>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  keyboardView: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoContainer: { 
    width: 64, 
    height: 64, 
    borderRadius: 16, 
    backgroundColor: Colors.primaryMuted, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  title: { fontSize: 28, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary },
  form: { gap: 16 },
  googleButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: '#4285F4', // Google blue can stay
    borderRadius: 12, 
    padding: 16, 
    gap: 12,
    borderWidth: 1, 
    borderColor: Colors.border 
  },
  googleButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, paddingHorizontal: 16 },
  inputContainer: { gap: 6 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
  input: { 
    backgroundColor: Colors.cardHover, 
    borderRadius: 12, 
    padding: 16, 
    fontSize: 16, 
    color: Colors.textPrimary, 
    borderWidth: 1, 
    borderColor: Colors.border 
  },
  error: { color: Colors.error, fontSize: 14, textAlign: 'center' },
  button: { 
    backgroundColor: Colors.secondary, // Using Secondary (Navi Dark) for primary action
    borderRadius: 12, 
    padding: 16, 
    alignItems: 'center' 
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.textLight, fontSize: 16, fontWeight: '600' },
  linkText: { color: Colors.primary, fontSize: 14, fontWeight: '500' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: Colors.textSecondary, fontSize: 14 },
});
