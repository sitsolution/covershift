import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Screen from '../../components/ui/Screen';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import BackButton from '../../components/ui/BackButton';
import authService from '../../services/authService';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'> };

function detailOf(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

/** Forgot Password: email → 6-digit code + new password → done. */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authService.forgotPassword(email.trim());
      setResendIn(res.resendAvailableInSeconds);
      setDebugOtp(res.debugOtp ?? null);
      setStep('reset');
    } catch (err) {
      setError(detailOf(err, 'Could not send the code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const errs: Record<string, string> = {};
    if (!/^\d{6}$/.test(code.trim())) errs.code = 'Enter the 6-digit code from the email.';
    if (newPw.length < 8) errs.newPw = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) errs.newPw = 'Must contain uppercase, lowercase, and a number.';
    if (newPw && confirmPw !== newPw) errs.confirmPw = 'Passwords do not match.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setError('');
    try {
      await authService.resetPassword(email.trim(), code.trim(), newPw);
      setStep('done');
    } catch (err) {
      setError(detailOf(err, 'Could not reset the password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // A code sent earlier (e.g. by an admin) is still valid; requesting a new
  // one would cancel it, so let the user go straight to entering it.
  const haveCode = () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setError('');
    setStep('reset');
  };

  const clearField =(key: string) => setFieldErrors((p) => ({ ...p, [key]: '' }));

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={() => (step === 'reset' ? setStep('email') : navigation.goBack())} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>
            {step === 'done' ? 'Password updated' : 'Reset your password'}
          </Text>
          <Text style={styles.description}>
            {step === 'email' && "Enter your account email and we'll send you a 6-digit reset code."}
            {step === 'reset' && (
              <>
                {'Enter the 6-digit code sent to '}
                <Text style={styles.emailHighlight}>{email.trim()}</Text>
                {'. It expires in 10 minutes.'}
              </>
            )}
            {step === 'done' && 'You can now log in with your new password.'}
          </Text>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {step === 'email' && (
            <>
              <Input
                label="Email Address"
                value={email}
                onChangeText={(v) => { setEmail(v); setError(''); }}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Button
                title="Send Reset Code"
                onPress={sendCode}
                loading={loading}
                disabled={!email.trim()}
                style={styles.btn}
              />
              <TouchableOpacity onPress={haveCode} style={styles.resendRow}>
                <Text style={styles.resendLink}>I already have a code</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'reset' && (
            <>
              {!!debugOtp && (
                <View style={styles.debugBanner}>
                  <Text style={styles.debugText}>🔧 Test code: <Text style={styles.debugCode}>{debugOtp}</Text></Text>
                </View>
              )}
              <Input
                label="Reset Code"
                value={code}
                onChangeText={(v) => { setCode(v.replace(/\D/g, '')); clearField('code'); }}
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                error={fieldErrors.code}
              />
              <Input
                label="New Password"
                value={newPw}
                onChangeText={(v) => { setNewPw(v); clearField('newPw'); }}
                placeholder="Min. 8 chars, uppercase, number"
                isPassword
                autoCapitalize="none"
                error={fieldErrors.newPw}
              />
              <Input
                label="Confirm New Password"
                value={confirmPw}
                onChangeText={(v) => { setConfirmPw(v); clearField('confirmPw'); }}
                placeholder="Repeat new password"
                isPassword
                autoCapitalize="none"
                error={fieldErrors.confirmPw}
              />
              <Button
                title="Reset Password"
                onPress={handleReset}
                loading={loading}
                style={styles.btn}
              />
              <View style={styles.resendRow}>
                {resendIn > 0 ? (
                  <Text style={styles.timerText}>
                    {'Resend available in '}
                    <Text style={styles.timerBold}>0:{resendIn.toString().padStart(2, '0')}</Text>
                  </Text>
                ) : (
                  <TouchableOpacity onPress={sendCode} disabled={loading}>
                    <Text style={styles.resendLink}>Resend Code</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {step === 'done' && (
            <Button
              title="Back to Login"
              onPress={() => navigation.navigate('Login')}
              style={styles.btn}
            />
          )}

          {step !== 'done' && (
            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.backLink}>
              <Text style={styles.backLinkText}>Back to Login</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FA' },
  flex: { flex: 1 },
  header: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 8 },
  body: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 32 },
  heading: { fontSize: 19, fontWeight: '800', color: '#14202E', marginBottom: 12 },
  description: { fontSize: 12, color: '#5C6B7A', lineHeight: 22, marginBottom: 24 },
  emailHighlight: { color: '#0F3D5C', fontWeight: '700' },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorText: { color: '#B91C1C', fontSize: 12, fontWeight: '600' },
  btn: { marginTop: 8, marginBottom: 16 },
  resendRow: { alignItems: 'center', marginTop: 4 },
  timerText: { fontSize: 11.5, color: '#5C6B7A' },
  timerBold: { fontSize: 11.5, color: '#14202E', fontWeight: '700' },
  resendLink: { fontSize: 11.5, color: '#175E86', fontWeight: '700' },
  debugBanner: {
    marginBottom: 14,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#F5C842',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  debugText: { fontSize: 11.5, color: '#7A5C00' },
  debugCode: { fontWeight: '800', letterSpacing: 1.5 },
  backLink: { alignItems: 'center', marginTop: 18 },
  backLinkText: { fontSize: 11.5, color: '#175E86', fontWeight: '700', textAlign: 'center' },
});
