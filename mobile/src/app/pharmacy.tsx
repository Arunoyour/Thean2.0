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

import { listPharmacyProducts, type PharmacyProduct } from '@/lib/api';
import { colors, commonStyles } from '@/lib/styles';

export default function PharmacyScreen() {
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      try {
        const response = await listPharmacyProducts();
        if (isMounted) {
          setProducts(response);
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError instanceof Error ? requestError.message : 'Could not load products.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={commonStyles.screen}>
      <ScrollView contentContainerStyle={commonStyles.scrollContent}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Home</Text>
        </Pressable>

        <Text style={commonStyles.eyebrow}>Pharmacy order</Text>
        <Text style={commonStyles.title}>Available products</Text>
        <Text style={commonStyles.lead}>Products listed by approved pharmacies with live stock.</Text>

        {isLoading ? (
          <View style={styles.centeredCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Loading pharmacy products</Text>
          </View>
        ) : null}

        {error ? <Text style={commonStyles.errorBox}>{error}</Text> : null}

        {!isLoading && !error && products.length === 0 ? (
          <View style={styles.centeredCard}>
            <Text style={styles.emptyTitle}>No products available yet</Text>
            <Text style={commonStyles.mutedText}>Approved pharmacy products will appear here.</Text>
          </View>
        ) : null}

        {!isLoading && !error ? (
          <View style={styles.productList}>
            {products.map((product) => (
              <View
                style={[styles.productCard, product.stock_quantity === 0 ? styles.productCardOut : null]}
                key={product.product_id}
              >
                <Text style={styles.pharmacyName}>{product.pharmacy_name ?? 'Approved pharmacy'}</Text>
                {product.stock_quantity === 0 ? <Text style={styles.stockBadge}>Out of stock</Text> : null}
                {product.discount_percent ? (
                  <Text style={styles.offerBadge}>{Math.round(Number(product.discount_percent))}% off</Text>
                ) : null}
                <Text style={styles.productName}>{product.product_name}</Text>
                <Text style={commonStyles.mutedText}>
                  {[product.brand, product.unit_label].filter(Boolean).join(' - ') ||
                    product.category ||
                    'Pharmacy product'}
                </Text>
                <View style={styles.productFooter}>
                  <View>
                    <Text style={styles.priceText}>INR {product.customer_price}</Text>
                    {product.offer_price ? <Text style={styles.mrpText}>MRP {product.price}</Text> : null}
                  </View>
                  <View style={styles.stockStack}>
                    {product.discount_amount ? (
                      <Text style={styles.saveText}>Save INR {product.discount_amount}</Text>
                    ) : null}
                    <Text style={styles.stockText}>
                      {product.stock_quantity > 0
                        ? `${product.stock_quantity} in stock`
                        : 'Currently unavailable'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  backText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  centeredCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 24,
    padding: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  loadingText: {
    color: colors.muted,
    fontWeight: '800',
  },
  productList: {
    gap: 14,
    marginTop: 24,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  productCardOut: {
    backgroundColor: '#f1f5f9',
    borderColor: '#64748b',
  },
  pharmacyName: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  offerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dff6e8',
    borderRadius: 8,
    color: '#115e36',
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stockBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    color: '#475569',
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  productName: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  productFooter: {
    borderTopColor: '#e3ebe8',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 14,
  },
  priceText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  mrpText: {
    color: '#8b9a96',
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'line-through',
  },
  stockStack: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 4,
  },
  saveText: {
    color: '#115e36',
    fontSize: 13,
    fontWeight: '900',
  },
  stockText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
});
