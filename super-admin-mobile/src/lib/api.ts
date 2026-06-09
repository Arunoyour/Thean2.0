import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:8000/api/v1';
const TOKEN_KEY = 'thean_super_admin_access_token';

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

export type SuperAdmin = {
  admin_id: string;
  full_name: string;
  email: string;
  phone_number: string;
};

export type Pharmacy = {
  account_id: string;
  owner_name: string;
  phone_number: string;
  email: string | null;
  is_active: boolean;
  activation_status: string;
  profile: {
    profile_id: string;
    store_name: string;
    license_number: string;
    address_line_1: string;
    city: string | null;
    state: string | null;
    pincode: string | null;
    latitude: number | null;
    longitude: number | null;
    is_listed: boolean;
  };
};

export async function requestOtp(phoneNumber: string) {
  return request<{ message: string; expires_in_seconds: number; development_otp?: string }>(
    '/super-admin/request-otp',
    {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber }),
    }
  );
}

export async function verifyOtp(phoneNumber: string, otp: string) {
  const response = await request<{ access_token: string; admin: SuperAdmin }>(
    '/super-admin/verify-otp',
    {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, otp }),
    }
  );
  await SecureStore.setItemAsync(TOKEN_KEY, response.access_token);
  return response;
}

export function getCurrentAdmin() {
  return request<SuperAdmin>('/super-admin/me', { authenticated: true });
}

export function listPharmacies() {
  return request<Pharmacy[]>('/super-admin/pharmacies', { authenticated: true });
}

export function activatePharmacy(accountId: string) {
  return request<Pharmacy>(`/super-admin/pharmacies/${accountId}/activate`, {
    method: 'POST',
    authenticated: true,
  });
}

export async function logoutAdmin() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
