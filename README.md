# Thean Full-Stack App

This workspace now contains a full-stack foundation based on `Super_App_Core_Infrastructure.md`.

## Structure

- `backend/` - FastAPI API with async PostgreSQL access.
- `backend/migrations/001_initial_schema.sql` - Initial PostgreSQL schema and indexes.
- `frontend/` - React + Vite web app with landing, registration, and OTP login pages.
- `pharmacy-frontend/` - Separate pharmacy merchant web app.
- `mobile/` - Expo React Native app for Android and iOS.
- `super-admin-mobile/` - Android-focused Expo app for super admin approval workflows.
- `super-admin-frontend/` - Super Admin web control center.

## Backend Setup

1. Create a PostgreSQL database locally.

```bash
createdb thean
```

2. Create your backend environment file.

```bash
cd backend
cp .env.example .env
```

3. Update `DATABASE_URL` and `APP_SECRET_KEY` in `backend/.env`.

Use a long random secret for `APP_SECRET_KEY`. Keep `MOCK_OTP_ENABLED=true` during local testing only.

4. Install backend dependencies.

```bash
python3 --version
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Use Python 3.11 or newer. The local verification for this workspace used Python 3.12.

5. Run the migration.

```bash
python -m app.db.migrate
```

6. Start the API.

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

## Pharmacy Database Setup

Pharmacy merchant data uses a separate PostgreSQL database from customer data.

1. Create the pharmacy database.

```bash
createdb thean_pharmacy
```

2. Confirm `PHARMACY_DATABASE_URL` exists in `backend/.env`.

```bash
PHARMACY_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/thean_pharmacy
```

3. Run the pharmacy migration.

```bash
cd backend
source .venv/bin/activate
python -m app.db.migrate_pharmacy
python -m app.db.migrate_pharmacy_products
python -m app.db.migrate_pharmacy_commercial_settings
python -m app.db.migrate_pharmacy_product_images
python -m app.db.migrate_pharmacy_product_approval
```

New pharmacies register with `is_active=false` and `is_listed=false`. A guarded super-admin endpoint can activate and list a pharmacy:

```http
POST /api/v1/pharmacy/admin/accounts/{account_id}/activate
X-Super-Admin-Token: <SUPER_ADMIN_TOKEN>
```

Approved pharmacies can add products from the pharmacy portal. Product creation is blocked until the pharmacy account is active and listed by super admin. Customer apps read only available products with stock from active/listed pharmacies:

```http
GET /api/v1/pharmacy/public/products
```

Super Admin can edit pharmacy details, product commission %, prescription commission %, and platform fee from `/dashboard/pharmacy`. Pharmacies can view product commission in read-only mode and can optionally enter an offer price while adding products. Product creation requires at least two photos; photos are stored as media files while PostgreSQL stores only image URLs. Customer apps show product photos, offer price, MRP, savings, and discount percentage when an offer exists.

New pharmacy products are created as `PENDING_APPROVAL` and remain hidden from customer apps until Super Admin approves them. The product approval workflow includes:

- `/dashboard/pharmacy/products` - Super Admin product review, commission breakdown, revision comments, and approval.
- `/products` - Pharmacy product list with product status, edit, out-of-stock, and revision resubmission.
- `/api/v1/ws/super-admin?token=<JWT>` - Super Admin realtime product notifications.
- `/api/v1/ws/pharmacy?token=<JWT>` - Pharmacy realtime product notifications.

The pharmacy database includes product comment audit records, realtime notification records, and `pharmacy_order_revenue_settlement_ledger` for future per-order revenue settlement entries.

## Frontend Setup

1. Create your frontend environment file.

```bash
cd frontend
cp .env.example .env
```

2. Install dependencies.

```bash
npm install
```

3. Start the web app.

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## Pharmacy Frontend Setup

```bash
cd pharmacy-frontend
cp .env.example .env
npm install
npm run dev
```

The pharmacy portal will be available at `http://127.0.0.1:5174`.

## Mobile Setup

The mobile app uses Expo React Native and connects to the same FastAPI backend.

1. Create your mobile environment file.

```bash
cd mobile
cp .env.example .env
```

2. Set `EXPO_PUBLIC_API_BASE_URL`.

Use `http://127.0.0.1:8000/api/v1` for iOS simulator on the same Mac. For Android emulator, use `http://10.0.2.2:8000/api/v1`. For a physical phone, use your Mac LAN IP, for example `http://192.168.1.10:8000/api/v1`.

3. Start Expo.

```bash
npm run ios
npm run android
```

## Current Pages

- `/` - Landing page
- `/register` - Customer registration
- `/login` - Customer OTP login
- `/home` - Post-login customer home page
- `/home/pharmacy` - Customer pharmacy product listing

The mobile app has matching landing, registration, login, post-login home, and pharmacy product listing screens.

The pharmacy portal has registration, OTP login, activation-status home, and separate product pages:

- `/products/add` - Add Product
- `/products` - Listed Products

## Super Admin Android App

The Super Admin apps have no registration flow. They login by mobile number and OTP, then show pharmacy merchants with activation controls.

Seeded super admin:

- Name: `Arun`
- Email: `arunoyour@gmail.com`
- Mobile: `9539536943`
- Local mock OTP: `123456`

Run it with:

```bash
cd super-admin-mobile
npm run android
```

For Android emulator, keep `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000/api/v1` in `super-admin-mobile/.env`.

## Super Admin Web App

```bash
cd super-admin-frontend
cp .env.example .env
npm install
npm run dev
```

The Super Admin web control center will be available at `http://127.0.0.1:5175`.

Routes:

- `/dashboard` - sector hub
- `/dashboard/pharmacy` - pharmacy approvals and activation dashboard

Pharmacy status changes require a comment. The pharmacy dashboard stores and displays a timeline for activation and disable events.

## Security And Scale Notes

- The API is designed as a shared backend for web, Android, and iOS clients.
- OTP values are hashed before storage.
- JWT access tokens are signed with `APP_SECRET_KEY`.
- PostgreSQL connection pooling is configured through `DATABASE_POOL_SIZE` and `DATABASE_MAX_OVERFLOW`.
- The first migration includes high-volume indexes for user lookup, OTP validation, store discovery, and pharmacy order queries.
- For production, replace mock OTP with a real SMS provider, add Redis-backed rate limiting, rotate secrets, and enforce HTTPS everywhere.
