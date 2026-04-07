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

import { API_URL } from '@/lib/supabase';

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
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoRing}>
            <Text style={styles.logoSymbol}>₹</Text>
          </View>
          <Text style={styles.brandName}>SpendSense AI</Text>
        </View>

        <View style={styles.headingSection}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue tracking</Text>
        </View>

        <View style={styles.form}>
          {/* Google */}
          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading}>
            <Feather name="chrome" size={18} color={Colors.textPrimary} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Your password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Sign In</Text>}
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
  keyboardView: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 24 },

  // Logo
  logoSection: { alignItems: 'center', marginBottom: 32 },
  logoRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoSymbol: { fontSize: 30, fontWeight: '800', color: Colors.primary },
  brandName: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 },

  headingSection: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary },

  form: { gap: 16 },

  // Google button — outlined style on dark
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    padding: 15,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  googleButtonText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.textMuted, paddingHorizontal: 16, fontSize: 13 },

  inputContainer: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.3 },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  error: { color: Colors.error, fontSize: 13, textAlign: 'center' },

  // Primary CTA — solid emerald
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  linkText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { color: Colors.textSecondary, fontSize: 14 },
});
