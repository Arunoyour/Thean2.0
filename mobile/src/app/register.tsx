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

import { registerCustomer } from '@/lib/api';
import { colors, commonStyles } from '@/lib/styles';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const user = await registerCustomer({
        full_name: fullName,
        phone_number: phoneNumber,
        email: email || null,
      });
      setMessage(`Registration created for ${user.phone_number}.`);
      setTimeout(() => router.replace('/login'), 700);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Registration failed.');
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
          <Text style={commonStyles.eyebrow}>Customer onboarding</Text>
          <Text style={commonStyles.title}>Create your Thean account</Text>
          <Text style={commonStyles.lead}>
            Register once and use the same identity for every future web, Android, and iOS flow.
          </Text>

          <View style={commonStyles.card}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
              style={styles.input}
            />

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              autoComplete="tel"
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoComplete="email"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            {message ? <Text style={commonStyles.successBox}>{message}</Text> : null}
            {error ? <Text style={commonStyles.errorBox}>{error}</Text> : null}

            <Pressable
              style={[styles.submitButton, isSubmitting && styles.disabled]}
              onPress={submit}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>Create account</Text>
              )}
            </Pressable>

            <Text style={styles.footerText}>
              Already registered? <Link href="/login" style={styles.footerLink}>Login with OTP</Link>
            </Text>
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
  footerText: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 18,
    textAlign: 'center',
  },
  footerLink: {
    color: colors.primary,
    fontWeight: '900',
  },
});

