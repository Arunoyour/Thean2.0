import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getCurrentUser, logoutCustomer, type User } from '@/lib/api';
import { colors, commonStyles } from '@/lib/styles';

const sectors = [
  ['Pharmacy', 'Upload prescriptions, approve substitutions, and track medicine delivery.', 'Rx'],
  ['Vegetables', 'Order fresh produce from nearby active stores.', 'Veg'],
  ['Print Shop', 'Send PDFs and documents to local print and photostat shops.', 'Doc'],
];

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  const firstName = useMemo(() => {
    if (!user?.full_name) {
      return 'Customer';
    }
    return user.full_name.split(' ')[0];
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const profile = await getCurrentUser();
        if (isMounted) {
          setUser(profile);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError instanceof Error ? requestError.message : 'Please login to continue.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  async function logout() {
    await logoutCustomer();
    router.replace('/login');
  }

  if (isLoading) {
    return (
      <SafeAreaView style={commonStyles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading your home</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !user) {
    return (
      <SafeAreaView style={commonStyles.screen}>
        <View style={styles.emptyState}>
          <Text style={commonStyles.errorBox}>{error || 'Please login to continue.'}</Text>
          <Pressable style={styles.submitButton} onPress={() => router.replace('/login')}>
            <Text style={styles.submitText}>Login again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.screen}>
      <ScrollView contentContainerStyle={commonStyles.scrollContent}>
        <Pressable style={styles.menuToggle} onPress={() => setIsMenuOpen((current) => !current)}>
          <Text style={styles.menuToggleText}>{isMenuOpen ? 'Close menu' : 'Menu'}</Text>
        </Pressable>

        {isMenuOpen ? (
          <View style={commonStyles.card}>
            <View style={styles.menuRow}>
              <Text style={styles.menuLabel}>Wallet balance</Text>
              <Text style={styles.menuValue}>INR {user.wallet_balance}</Text>
            </View>
            <View style={styles.menuRow}>
              <Text style={styles.menuLabel}>Default address</Text>
              <Text style={styles.menuValue}>Not added</Text>
            </View>
            <View style={styles.menuRow}>
              <Text style={styles.menuLabel}>Active orders</Text>
              <Text style={styles.menuValue}>0</Text>
            </View>
            <Pressable style={styles.outlineButton}>
              <Text style={styles.outlineText}>Add address</Text>
            </Pressable>
            <Pressable style={styles.logoutButton} onPress={logout}>
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={commonStyles.eyebrow}>Unified customer core</Text>
        <Text style={commonStyles.title}>Hi, {firstName}</Text>
        <Text style={commonStyles.lead}>
          Your Thean account connects wallet, addresses, and local services across every customer
          app experience.
        </Text>

        <Text style={styles.sectionTitle}>Choose a service</Text>
        <View style={styles.sectorList}>
          {sectors.map(([title, description, icon]) => (
            <Pressable
              style={styles.sectorCard}
              key={title}
              onPress={() => {
                if (title === 'Pharmacy') {
                  router.push('/pharmacy');
                }
              }}
            >
              <View style={commonStyles.iconBox}>
                <Text style={commonStyles.iconText}>{icon}</Text>
              </View>
              <View style={styles.sectorCopy}>
                <Text style={styles.sectorTitle}>{title}</Text>
                <Text style={commonStyles.mutedText}>{description}</Text>
                <Text style={styles.statusText}>
                  {title === 'Pharmacy'
                    ? 'View products'
                    : title === 'Vegetables'
                      ? 'Store catalog next'
                      : 'File upload next'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.muted,
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  menuToggle: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  menuToggleText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  menuRow: {
    borderBottomColor: '#e3ebe8',
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 14,
  },
  menuLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  menuValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  outlineButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  outlineText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 48,
  },
  logoutText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 32,
  },
  sectorList: {
    gap: 14,
    marginTop: 14,
  },
  sectorCard: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  sectorCopy: {
    flex: 1,
    gap: 8,
  },
  sectorTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  statusText: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    color: colors.warningText,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
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
});
