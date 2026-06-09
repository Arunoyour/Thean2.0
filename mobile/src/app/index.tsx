import { Link } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, commonStyles } from '@/lib/styles';

const serviceSummaries = [
  ['Cross-platform ready', 'Same backend contract for web, Android, and iOS clients.'],
  ['Wallet-first core', 'Customer identity and wallet rules stay unified across sectors.'],
  ['Local routing', 'Store discovery and fulfillment are designed around nearby merchants.'],
];

export default function LandingScreen() {
  return (
    <SafeAreaView style={commonStyles.screen}>
      <ScrollView contentContainerStyle={commonStyles.scrollContent}>
        <Text style={commonStyles.eyebrow}>Unified local commerce</Text>
        <Text style={commonStyles.heroTitle}>Thean</Text>
        <Text style={commonStyles.lead}>
          One secure account for pharmacy, fresh produce, print services, wallet payments, and
          location-aware delivery workflows.
        </Text>

        <View style={styles.actions}>
          <Link href="/register" style={commonStyles.primaryButton}>
            Start registration
          </Link>
          <Link href="/login" style={commonStyles.secondaryButton}>
            Customer login
          </Link>
        </View>

        <View style={commonStyles.card}>
          {serviceSummaries.map(([title, description]) => (
            <View style={styles.serviceRow} key={title}>
              <View style={commonStyles.iconBox}>
                <Text style={commonStyles.iconText}>{title.charAt(0)}</Text>
              </View>
              <View style={styles.serviceCopy}>
                <Text style={styles.serviceTitle}>{title}</Text>
                <Text style={commonStyles.mutedText}>{description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: 28,
  },
  serviceRow: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 14,
  },
  serviceCopy: {
    flex: 1,
    gap: 4,
  },
  serviceTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
});

