import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { requestOtp, verifyOtp } from '@/lib/api';
import { colors, commonStyles } from '@/lib/styles';

export default function LoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('9539536943');
  const [otp, setOtp] = useState('');
  const [phase, setPhase] = useState<'request' | 'verify'>('request');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestLoginOtp() {
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await requestOtp(phoneNumber);
      const suffix = response.development_otp ? ` Development OTP: ${response.development_otp}` : '';
      setMessage(`${response.message}${suffix}`);
      setPhase('verify');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send OTP.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyLoginOtp() {
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      await verifyOtp(phoneNumber, otp);
      router.replace('/home');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not verify OTP.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={commonStyles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={commonStyles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={commonStyles.eyebrow}>Thean control center</Text>
          <Text style={commonStyles.title}>Super Admin</Text>
          <Text style={commonStyles.lead}>
            Login with your registered mobile number and OTP to approve pharmacy merchants.
          </Text>

          <View style={commonStyles.card}>
            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              editable={phase === 'request'}
              keyboardType="phone-pad"
              style={[styles.input, phase === 'verify' && styles.disabledInput]}
            />

            {phase === 'verify' ? (
              <>
                <Text style={styles.label}>OTP</Text>
                <TextInput
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.input}
                />
              </>
            ) : null}

            {message ? <Text style={commonStyles.successBox}>{message}</Text> : null}
            {error ? <Text style={commonStyles.errorBox}>{error}</Text> : null}

            <Pressable
              style={[styles.submitButton, isSubmitting && styles.disabled]}
              onPress={phase === 'request' ? requestLoginOtp : verifyLoginOtp}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>
                  {phase === 'request' ? 'Send OTP' : 'Verify OTP'}
                </Text>
              )}
            </Pressable>

            {phase === 'verify' ? (
              <Pressable
                onPress={() => {
                  setPhase('request');
                  setOtp('');
                  setMessage('');
                  setError('');
                }}>
                <Text style={styles.textButton}>Change mobile number</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#c9d8d4',
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  disabledInput: {
    backgroundColor: '#eef3f1',
    color: colors.muted,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 50,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.7,
  },
  textButton: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 16,
    textAlign: 'center',
  },
});

