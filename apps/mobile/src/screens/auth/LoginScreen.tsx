import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Screen from '../../components/ui/Screen';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import authService from '../../services/authService';
import { useAuth } from '../../store/auth';
import Toast, { ToastType } from '../../components/ui/Toast';

// The OAuth *web* client ID from the client's Google Cloud project: Google
// issues the ID token to it, and the API only accepts tokens for it. Empty
// hides the Google button.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
if (GOOGLE_WEB_CLIENT_ID) GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { saveTokens } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as ToastType });

  const showToast = (message: string, type: ToastType = 'error') =>
    setToast({ visible: true, message, type });

  const handleGoogleSignIn = async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Start from a clean state so the account picker always shows.
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;   // user closed the picker
      const idToken = response.data.idToken;
      if (!idToken) throw new Error('No ID token');
      await handleGoogleToken(idToken);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) return;
      showToast('Google sign-in failed. Please try again.');
    }
  };

  const handleGoogleToken = async (idToken: string) => {
    setGoogleLoading(true);
    try {
      const result = await authService.googleAuth(idToken);
      if ('needsRegistration' in result && result.needsRegistration) {
        navigation.navigate('GoogleSignup', {
          googleEmail: result.googleEmail,
          googleName: result.googleName,
          idToken,
        });
      } else {
        const data = result as any;
        await saveTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          userId: data.userId,
          role: data.role,
          isVerified: data.isVerified,
        });
      }
    } catch {
      showToast('Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showToast('Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const data = await authService.login(email, password);
      if (!data.isVerified) {
        navigation.navigate('OTPVerification', { email, debugOtp: data.debugOtp ?? undefined });
      } else {
        await saveTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          userId: data.userId,
          role: data.role,
          isVerified: data.isVerified,
        });
      }
    } catch (err: unknown) {
      const detail = (err as any)?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((e: any) => e.msg ?? JSON.stringify(e)).join('\n')
        : (typeof detail === 'string' ? detail : 'Login failed. Please try again.');
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.subtitle}>Login to manage your shifts</Text>

        <Input
          label="Email Address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          isPassword
        />

        <TouchableOpacity
          onPress={() => navigation.navigate('ForgotPassword')}
          style={styles.forgotRow}
          disabled={loading}
        >
          <Text style={[styles.forgotText, loading && { opacity: 0.4 }]}>Forgot Password?</Text>
        </TouchableOpacity>

        <Button title="Login" onPress={handleLogin} loading={loading} style={styles.loginBtn} />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {GOOGLE_WEB_CLIENT_ID ? (
          <Button
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            variant="outline"
            style={styles.googleBtn}
          />
        ) : null}

        <TouchableOpacity
          onPress={() => navigation.navigate('SelectRole')}
          style={styles.signupLink}
          disabled={loading}
        >
          <Text style={[styles.signupLinkText, loading && { opacity: 0.4 }]}>
            Don't have an account?{' '}
            <Text style={styles.link}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { paddingHorizontal: 18, paddingTop: 60, paddingBottom: 20 },
  heading: { fontSize: 20, fontWeight: '800', color: '#14202E', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#5C6B7A', marginBottom: 28 },
  forgotRow: { alignItems: 'flex-end', marginTop: -4, marginBottom: 18 },
  forgotText: { fontSize: 11.5, color: '#175E86', fontWeight: '700' },
  loginBtn: { marginBottom: 16 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#DCE4EA' },
  dividerText: { marginHorizontal: 10, fontSize: 10.5, color: '#8697A6', fontWeight: '600' },
  googleBtn: { marginBottom: 10 },
  signupLink: { alignItems: 'center', marginTop: 20 },
  signupLinkText: { fontSize: 11.5, color: '#5C6B7A' },
  link: { color: '#0F3D5C', fontWeight: '700' },
});
