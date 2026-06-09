import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  activatePharmacy,
  getCurrentAdmin,
  listPharmacies,
  logoutAdmin,
  type Pharmacy,
  type SuperAdmin,
} from '@/lib/api';
import { colors, commonStyles } from '@/lib/styles';

export default function HomeScreen() {
  const [admin, setAdmin] = useState<SuperAdmin | null>(null);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  async function loadData() {
    setError('');
    try {
      const [adminProfile, pharmacyList] = await Promise.all([getCurrentAdmin(), listPharmacies()]);
      setAdmin(adminProfile);
      setPharmacies(pharmacyList);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load admin data.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function logout() {
    await logoutAdmin();
    router.replace('/login');
  }

  async function activate(accountId: string) {
    setActivatingId(accountId);
    try {
      const updated = await activatePharmacy(accountId);
      setPharmacies((current) =>
        current.map((pharmacy) => (pharmacy.account_id === accountId ? updated : pharmacy))
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Activation failed.');
    } finally {
      setActivatingId(null);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={commonStyles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading control center</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !admin) {
    return (
      <SafeAreaView style={commonStyles.screen}>
        <View style={styles.emptyState}>
          <Text style={commonStyles.errorBox}>{error}</Text>
          <Pressable style={styles.submitButton} onPress={() => router.replace('/login')}>
            <Text style={styles.submitText}>Login again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const pendingCount = pharmacies.filter((pharmacy) => !pharmacy.is_active).length;

  return (
    <SafeAreaView style={commonStyles.screen}>
      <ScrollView contentContainerStyle={commonStyles.scrollContent}>
        <Text style={commonStyles.eyebrow}>Super admin</Text>
        <Text style={commonStyles.title}>Hi, {admin?.full_name}</Text>
        <Text style={commonStyles.lead}>
          Review pharmacy registrations and activate approved merchants for Thean customers.
        </Text>

        <View style={commonStyles.card}>
          <Text style={styles.metricLabel}>Pending pharmacies</Text>
          <Text style={styles.metricValue}>{pendingCount}</Text>
          <Text style={commonStyles.mutedText}>{admin?.email}</Text>
          <Pressable style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        {error ? <Text style={commonStyles.errorBox}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Pharmacies</Text>
        <View style={styles.list}>
          {pharmacies.map((pharmacy) => (
            <View style={styles.pharmacyCard} key={pharmacy.account_id}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.storeName}>{pharmacy.profile.store_name}</Text>
                  <Text style={commonStyles.mutedText}>{pharmacy.profile.license_number}</Text>
                </View>
                <Text style={pharmacy.is_active ? styles.activeBadge : styles.pendingBadge}>
                  {pharmacy.is_active ? 'Active' : 'Pending'}
                </Text>
              </View>
              <Text style={styles.addressText}>
                {pharmacy.profile.address_line_1}
                {pharmacy.profile.city ? `, ${pharmacy.profile.city}` : ''}
              </Text>
              <Text style={commonStyles.mutedText}>{pharmacy.phone_number}</Text>
              {!pharmacy.is_active ? (
                <Pressable
                  style={styles.submitButton}
                  disabled={activatingId === pharmacy.account_id}
                  onPress={() => activate(pharmacy.account_id)}>
                  {activatingId === pharmacy.account_id ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitText}>Activate pharmacy</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
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
  metricLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '900',
    marginTop: 4,
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 16,
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
    marginTop: 28,
  },
  list: {
    gap: 14,
    marginTop: 14,
  },
  pharmacyCard: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  storeName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  addressText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  activeBadge: {
    backgroundColor: '#dff6e8',
    borderRadius: 8,
    color: '#115e36',
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingBadge: {
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    color: colors.warningText,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 50,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
});

