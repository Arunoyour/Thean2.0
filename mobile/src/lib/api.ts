import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'thean_access_token';

type RequestOptions = RequestInit & {
  authenticated?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (options.authenticated) {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) {
      throw new Error('Please login to continue.');
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.detail ?? 'Request failed. Please try again.');
  }

  return payload as T;
}

export type User = {
  id: string;
  phone_number: string;
  email: string | null;
  full_name: string | null;
  wallet_balance: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: 'bearer';
  user: User;
};

export type PharmacyProduct = {
  product_id: string;
  account_id: string;
  pharmacy_name: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  unit_label: string | null;
  price: string;
  offer_price: string | null;
  customer_price: string;
  discount_amount: string | null;
  discount_percent: string | null;
  stock_quantity: number;
  is_available: boolean;
  created_at: string;
};

export async function registerCustomer(data: {
  full_name: string;
  phone_number: string;
  email: string | null;
}) {
  return request<User>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function requestOtp(phoneNumber: string) {
  return request<{ message: string; expires_in_seconds: number; development_otp?: string }>(
    '/auth/request-otp',
    {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber }),
    }
  );
}

export async function verifyOtp(phoneNumber: string, otp: string) {
  const response = await request<AuthResponse>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
  await SecureStore.setItemAsync(TOKEN_KEY, response.access_token);
  return response;
}

export function getCurrentUser() {
  return request<User>('/auth/me', { authenticated: true });
}

export function listPharmacyProducts() {
  return request<PharmacyProduct[]>('/pharmacy/public/products');
}

export async function logoutCustomer() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
