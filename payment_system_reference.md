# DHUB Payment System — Complete Implementation Reference

**Last Updated:** 2026-07-21  
**Covers:** `dhubpayment-main` (backend on Render) + `Dhub` mobile app (React Native/Expo)  
**Author note:** This document is purely technical. No marketing language. Every claim is cited to a specific file and line number.

---

## TABLE OF CONTENTS

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Why Two-Step Collection + Disbursement?](#2-why-two-step-collection--disbursement)
3. [Database Schema — Payment Backend (PostgreSQL)](#3-database-schema--payment-backend-postgresql)
4. [Database Schema — Dhub App (Supabase)](#4-database-schema--dhub-app-supabase)
5. [All Backend Endpoints](#5-all-backend-endpoints)
6. [The Full Payment Lifecycle — Step by Step](#6-the-full-payment-lifecycle--step-by-step)
7. [Zero-Trust Security Model](#7-zero-trust-security-model)
8. [Admin Dashboard — UI and Config Management](#8-admin-dashboard--ui-and-config-management)
9. [Mobile App — How Screens Call the Backend](#9-mobile-app--how-screens-call-the-backend)
10. [Dynamic Pricing — How it Works End-to-End](#10-dynamic-pricing--how-it-works-end-to-end)
11. [MoMo vs Fapshi — Provider Strategy Pattern](#11-momo-vs-fapshi--provider-strategy-pattern)
12. [Test Scenarios and Case Studies](#12-test-scenarios-and-case-studies)
13. [Known Bugs, Root Causes, and Fixes](#13-known-bugs-root-causes-and-fixes)
14. [Environment Variables Reference](#14-environment-variables-reference)
15. [Deployment Checklist (Render)](#15-deployment-checklist-render)

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

The Dhub payment system is composed of three independent layers that communicate through defined contracts:

```
┌─────────────────────────────────────────────────────────────┐
│                   DHUB MOBILE APP (Expo/RN)                 │
│  BookingDetails.tsx → PaymentScreen.tsx → paymentService.ts │
│  BoostScreen.tsx → LandlordPaymentScreen.tsx                 │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (JWT in Authorization header)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           DHUB PAYMENT BACKEND (Node/Express on Render)     │
│   /api/payments/*  /api/webhooks/*  /admin/*                │
│   PaymentService → CollectionService → DisbursementService  │
└───────────┬──────────────────────────┬──────────────────────┘
            │ MTN MoMo API             │ Supabase REST API
            ▼                          ▼
┌───────────────────┐      ┌──────────────────────────────────┐
│ MTN MoMo          │      │ SUPABASE (PostgreSQL)             │
│ Collection API    │      │ bookings, listings, users, etc.   │
│ Disbursement API  │      │ Also: payments (Dhub copy)        │
└───────────────────┘      └──────────────────────────────────┘
            │
            │ Webhook callback
            ▼
┌─────────────────────────────────────────────────────────────┐
│           DHUB PAYMENT BACKEND — Webhook Handler            │
│   POST /api/webhooks/momo                                   │
│   handleWebhook() → updates DB, triggers disbursement       │
└─────────────────────────────────────────────────────────────┘
```

The backend also has its own **local PostgreSQL database** (separate from Supabase) that stores all raw payment records, transfer types, boost plans, subscription tiers, and platform settings. This database is bootstrapped automatically on every server start via `initDb()` in `src/config/db.ts`.

---

## 2. WHY TWO-STEP COLLECTION + DISBURSEMENT?

MTN MoMo does not support split payments natively. You cannot say "charge 100,000 XAF and send 97,500 to the landlord and 2,500 to Dhub" in a single API call.

Instead, Dhub acts as a **financial relay** using two separate MTN MoMo product APIs:

### Step 1: Collection (MTN MoMo Collection product)
- API endpoint used: `POST /collection/v1_0/requesttopay`
- Implementation: `src/services/collection.service.ts`, line 49
- Effect: The student's MoMo wallet is debited. The **full amount** lands in Dhub's MTN Merchant Wallet (the account tied to your `MOMO_COLLECTION_USER_ID` and `MOMO_COLLECTION_API_KEY` credentials).
- At this point, Dhub holds **all the money**.

### Step 2: Disbursement (MTN MoMo Disbursement product)
- API endpoint used: `POST /disbursement/v1_0/transfer`
- Implementation: `src/services/disbursement.service.ts`, line 47
- Effect: The backend sends `receiver_amount` (total minus Dhub's fee) from the Dhub Merchant Wallet to the landlord's personal MoMo number.
- Triggered by: `handleWebhook()` in `payment.service.ts` line 324, when `status === 'SUCCESSFUL'` AND `payment_type === 'transfer'`.

### The Fee Split
The fee calculation is in `src/utils/feeCalculator.ts`, called at `payment.service.ts` line 196:
```
platformFee = flat_fee + (amount * percentage_fee / 100)
receiverAmount = amount - platformFee
```

The `flat_fee` and `percentage_fee` values come from the `transfer_types` table in the local PostgreSQL DB. This table is populated by the admin dashboard at `/admin/transfer-types`.

For example, if `transfer_types` for `'apartment'` has `flat_fee = 0` and `percentage_fee = 2.50`:
- Student pays: 100,000 XAF
- Platform fee: 2,500 XAF
- Landlord receives: 97,500 XAF

---

## 3. DATABASE SCHEMA — PAYMENT BACKEND (PostgreSQL)

The payment backend maintains its own dedicated PostgreSQL database (configured via `DATABASE_URL` in `.env`). Schema is auto-created and migrated on every boot by `initDb()` in `src/config/db.ts`.

### 3.1 `payments` table
Primary ledger for every transaction attempted in the system.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Auto-generated primary key |
| `reference_id` | UUID UNIQUE | The UUID sent to MTN/Fapshi as the external reference |
| `payer_phone` | VARCHAR(20) | Phone number of payer (normalized, digits only) |
| `receiver_phone` | VARCHAR(20) | Phone number of receiver (empty for collection-only) |
| `total_amount` | DECIMAL(12,2) | Amount charged to payer |
| `platform_fee` | DECIMAL(12,2) | Dhub's cut |
| `receiver_amount` | DECIMAL(12,2) | Amount disbursed to landlord |
| `status` | VARCHAR(50) | `PENDING`, `SUCCESSFUL`, `FAILED` (from MoMo) |
| `payment_type` | VARCHAR(20) | `transfer` or `collection` |
| `reason` | VARCHAR(100) | `rent`, `boosting`, `landlord_subscription` |
| `transfer_type` | VARCHAR(50) | FK to `transfer_types.type_code` |
| `booking_id` | UUID | Set for Dhub booking payments |
| `auth_user_id` | UUID | Supabase user ID of the payer |
| `idempotency_key` | UUID UNIQUE | Prevents double-charges |
| `payment_kind` | VARCHAR(30) | `initial`, `rent_completion`, `renewal` |
| `payout_status` | VARCHAR(30) | `NOT_APPLICABLE`, `HELD`, `DISBURSED` |
| `payout_reference_id` | UUID | Reference for the disbursement API call |
| `amount` | DECIMAL | **Legacy column (nullable, default 0).** Was NOT NULL in old schema; migration in `initDb()` drops the constraint. Do not use; use `total_amount`. |

> **Migration note:** If the server previously ran with an old schema that had `amount NOT NULL`, the `fixLegacyAmountColumnQuery` in `initDb()` (added 2026-07-21) patches it to `DROP NOT NULL, SET DEFAULT 0` on boot. This is idempotent and safe to run on live data.

### 3.2 `transfer_types` table
Admin-editable fee configurations for each listing category.

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL | Primary key |
| `type_code` | VARCHAR(50) UNIQUE | e.g. `apartment`, `room`, `studio`, `rent` |
| `label` | VARCHAR(100) | Display name |
| `flat_fee` | DECIMAL(12,2) | Fixed fee in XAF |
| `percentage_fee` | DECIMAL(5,2) | % of total amount |
| `active` | BOOLEAN | Whether this type is usable |

**Seed values (from `initDb()`):**
| type_code | label | flat_fee | percentage_fee |
|-----------|-------|----------|----------------|
| `apartment` | Apartment | 0.00 | 2.50 |
| `room` | Room | 0.00 | 2.50 |
| `studio` | Studio | 0.00 | 2.50 |
| `house` | House | 0.00 | 2.50 |
| `guest_house` | Guest House | 0.00 | 2.50 |
| `hotel` | Hotel | 0.00 | 2.50 |
| `rent` | Rent Completion | 5000.00 | 0.00 |

> **Why `rent` has a flat fee instead of percentage?** The rent completion payment (the second payment a student makes after the initial booking is confirmed) sends the full rent amount minus a flat processing fee of 5,000 XAF to the landlord. This is more predictable for the landlord than a percentage.

### 3.3 `boost_plans` table
Stores the pricing for listing boosts. Read by the mobile app's `BoostScreen.tsx` via Supabase.

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(50) | e.g. `plan1`, `plan3`, `plan7`, `plan30` |
| `label` | VARCHAR(100) | e.g. `1 Day Boost` |
| `duration_days` | INT | How many days the boost lasts |
| `price` | DECIMAL(12,2) | Price in XAF |
| `active` | BOOLEAN | If false, not shown in app |

**Seed values:**
| id | label | duration_days | price |
|----|-------|---------------|-------|
| `plan1` | 1 Day Boost | 1 | 500.00 |
| `plan3` | 3 Days Boost | 3 | 1,200.00 |
| `plan7` | 7 Days Boost | 7 | 2,500.00 |
| `plan30` | 30 Days Boost | 30 | 9,000.00 |

### 3.4 `subscription_tiers` table
Stores landlord subscription plans.

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR(50) | e.g. `tier_monthly` |
| `name` | VARCHAR(100) | Display name |
| `duration_days` | INT | Subscription period |
| `price` | DECIMAL(12,2) | Price in XAF |
| `features` | JSONB | Array of feature strings |
| `active` | BOOLEAN | Visibility flag |

**Seed values:**
| id | name | duration_days | price |
|----|------|---------------|-------|
| `tier_monthly` | Monthly Plan | 30 | 10,000.00 |
| `tier_quarterly` | Quarterly Plan | 90 | 25,000.00 |
| `tier_annual` | Annual Plan | 365 | 90,000.00 |

### 3.5 `pricing_configs` table
General key-value configuration store for platform-wide settings.

| config_key | config_value | description |
|------------|-------------|-------------|
| `rent_processing_fee` | 5000.00 | Processing fee for rent payments |
| `platform_commission` | 2.50 | Platform commission percentage |

### 3.6 `payment_clients` table
Links a `reference_id` to its originating client system (always `'Dhub'` for now). Stores the full client payload as JSONB for webhook routing.

### 3.7 `account_details` table
Single-row table tracking cumulative platform earnings.
- `total_earnings`: Updated via `UPDATE account_details SET total_earnings = total_earnings + platform_fee` each time a payment webhook reports SUCCESSFUL.

### 3.8 `platform_settings` table
Controls which payment provider is active and which MoMo environment to use.
- `active_provider`: `'momo'` or `'fapshi'`
- `momo_environment`: `'sandbox'` or `'live'`

---

## 4. DATABASE SCHEMA — DHUB APP (SUPABASE)

The Supabase database is the main application database. The payment backend reads from it (to validate bookings, look up landlord phones, etc.) using the service-role key (`SUPABASE_SERVICE_ROLE_KEY`). Supabase also holds a mirrored copy of payments (in the `payments` table) which the mobile app reads for its history display.

### 4.1 Key tables the payment backend queries

**`bookings`** — queried in `initiateDhubBookingPayment()` at `payment.service.ts` line 44:
```sql
SELECT id, student_id, landlord_id, listing_id, approval_status, status, 
       payment_status, rent_payment_status, caution_fee, total_amount, amount
FROM bookings WHERE id = $1
```
- `total_amount`: The full rent amount set by the landlord when the booking was created
- `caution_fee`: The security deposit component
- `approval_status`: Must be `'approved'` before any payment is allowed
- `payment_status`: Set to `'completed'` by the backend webhook after initial payment
- `rent_payment_status`: Set to `'completed'` by backend webhook after rent_completion

**`users`** — queried twice:
1. To validate the payer's registered phone (lines 55–66): Only phones registered in `users.phone` or `users.momo` are accepted.
2. To look up the landlord's payout number (lines 68–74): Uses `landlord.momo` preferred, falls back to `landlord.phone`.

**`listings`** — NOT directly queried by the payment backend (the listing price is embedded in the `bookings.total_amount` when a booking is created in the Dhub app itself).

---

## 5. ALL BACKEND ENDPOINTS

### 5.1 Public / Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | None | Returns `{"success": true, "message": "backend is running"}` |
| `GET` | `/health` | None | Returns status OK with timestamp |

### 5.2 Payment Endpoints (`/api/payments/`)

All require `Authorization: Bearer <supabase_access_token>` header. Validated by `requireUser` middleware in `src/middleware/apiAuth.middleware.ts`.

#### `POST /api/payments/transfer`
Initiates a payment where the money collected from the payer is automatically disbursed to a receiver (minus Dhub's fee) once confirmed.

**Request Body:**
```json
{
  "payerPhone":    "651098669",
  "receiverPhone": "674414090",
  "amount":        "100000",
  "reason":        "rent",
  "transferType":  "apartment",
  "planId":        null,
  "tierId":        null,
  "client": {
    "name":            "Dhub",
    "description":     "Rent payment for Listing XYZ",
    "payer_id":        "uuid-of-student",
    "payee_id":        "uuid-of-landlord",
    "listing_id":      "uuid-of-listing",
    "booking_id":      "uuid-of-booking",
    "idempotency_key": "dhub-transfer-<user_id>-<receiver>-<amount>"
  }
}
```

**Security enforcement (controller, line 22):**
- If `reason === 'rent'`, `amount` must be present and > 0 (the booking amount comes from Supabase, pre-validated by the calling screen).
- If `reason === 'boosting'`, `planId` must be set; `amount` is ignored; backend fetches price from `boost_plans`.
- If `reason === 'landlord_subscription'`, `tierId` must be set; backend fetches price from `subscription_tiers`.

**transferType matching:** Case-insensitive. `'Apartment'`, `'apartment'`, `'APARTMENT'` all resolve correctly via `LOWER(type_code) = $1` (see `payment.service.ts` line 188).

#### `POST /api/payments/collection`
Initiates a payment where the money stays with the platform. Used for boost payments and subscription payments where Dhub is the final recipient.

**Request Body:**
```json
{
  "payerPhone": "651098669",
  "reason":     "boosting",
  "planId":     "plan7",
  "client": {
    "name":            "Dhub",
    "id":              "uuid-of-collection-session",
    "payer_id":        "uuid-of-landlord",
    "listing_id":      "uuid-of-listing",
    "idempotency_key": "dhub-collection-..."
  }
}
```

#### `POST /api/payments/booking-intents`
**The most secure endpoint.** Used exclusively for student rent payments. The client sends ZERO financial information — only the booking ID and their phone number.

**Request Body:**
```json
{
  "bookingId":       "uuid-of-booking",
  "payerPhone":      "651098669",
  "paymentKind":     "initial",
  "idempotencyKey":  "dhub-booking-<booking_id>-initial"
}
```

**What the backend does (all in `initiateDhubBookingPayment()`, `payment.service.ts` lines 19–133):**
1. Checks if this idempotency key was already processed (prevents double-charge).
2. Fetches the full booking from Supabase.
3. Validates that `booking.student_id === userId` (prevents paying for someone else's booking).
4. Validates `booking.approval_status === 'approved'` and `booking.status !== 'cancelled'`.
5. Validates the payer's phone is registered in their Dhub user profile.
6. Fetches the landlord's MoMo number from Supabase.
7. Reads `pricing_configs` / `transfer_types` for the rent processing fee.
8. Calculates the correct amount server-side:
   - `initial`: `caution_fee + rent_processing_fee`
   - `rent_completion`: `total_amount - caution_fee`
   - `renewal`: `rent_processing_fee`
9. Calls MoMo Collection API.
10. Upserts the payment into Supabase's `payments` table (the one the app reads from).

#### `GET /api/payments/:referenceId`
Returns current status of a payment. If the DB shows `PENDING`, it auto-syncs from MoMo before responding.

#### `GET /api/payments/dhub/:referenceId`
Same as above, but validates the authenticated user owns this payment (`auth_user_id === userId`).

### 5.3 Webhook Endpoints (`/api/webhooks/`)

#### `POST /api/webhooks/momo`
Called by MTN MoMo when a payment prompt is accepted or declined by the user.

**What it does (`handleWebhook()`, `payment.service.ts` lines 265–341):**
1. Looks up the `reference_id` in the local DB.
2. Skips if status is not `PENDING` (idempotency guard).
3. Updates `status` to whatever MoMo sent (`SUCCESSFUL`, `FAILED`, etc.).
4. If Supabase client is attached: syncs status into Supabase `payments` table via `upsertDhubPayment()`.
5. If `SUCCESSFUL`:
   - Adds `platform_fee` to `account_details.total_earnings`.
   - If `payment_kind === 'initial'`: Updates `bookings.payment_status = 'completed'`, `status = 'confirmed'`, `contract_status = 'enforced'`.
   - If `payment_kind === 'rent_completion'`: Updates `bookings.rent_payment_status = 'completed'`.
6. Triggers disbursement ONLY if `payment_type === 'transfer'` AND it's not a booking rent_completion (which is held in escrow until 2-way handshake).

### 5.4 Admin Endpoints

All `/admin/*` routes are protected by session-cookie auth (username/password from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars). They render EJS server-side HTML pages.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/login` | Login form |
| `POST` | `/admin/login` | Process login |
| `GET` | `/admin/logout` | Destroy session |
| `GET` | `/admin/dashboard` | Transactions dashboard with filters/pagination |
| `GET` | `/admin/transfer-types` | List all transfer type fee configs |
| `POST` | `/admin/transfer-types` | Create a new transfer type |
| `POST` | `/admin/transfer-types/:id` | Update an existing transfer type |
| `POST` | `/admin/transfer-types/:id/toggle` | Enable/disable a transfer type |
| `GET` | `/admin/boost-plans` | **[NEW]** List and edit all boost plans |
| `POST` | `/admin/boost-plans/:id` | **[NEW]** Update a specific boost plan |
| `GET` | `/admin/subscription-tiers` | **[NEW]** List and edit subscription tiers |
| `POST` | `/admin/subscription-tiers/:id` | **[NEW]** Update a specific subscription tier |
| `GET` | `/admin/feature-flags` | Feature flag management |

### 5.5 Admin Config API Endpoints (for programmatic access)

Protected by `requireAdmin` middleware which validates the Bearer token's `role === 'admin'` in Supabase JWT claims.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/payment-config/pricing` | Get all pricing configs |
| `PUT` | `/api/admin/payment-config/pricing/:key` | Update a pricing config |
| `GET` | `/api/admin/payment-config/boost-plans` | Get all boost plans |
| `PUT` | `/api/admin/payment-config/boost-plans/:id` | Update a boost plan |
| `GET` | `/api/admin/payment-config/subscription-tiers` | Get all subscription tiers |
| `PUT` | `/api/admin/payment-config/subscription-tiers/:id` | Update a subscription tier |

### 5.6 Public Endpoints (`/api/public/`)

For unauthenticated reads like fetching available plans without logging in.

### 5.7 Escrow Endpoints (`/api/escrow/`)

For the 2-way handshake release of held rent_completion payments.

---

## 6. THE FULL PAYMENT LIFECYCLE — STEP BY STEP

### Scenario: Student Pays Initial Booking Deposit

This is the most common and most complex flow.

**Step 1 — Student views approved booking in `BookingDetails.tsx`**

The screen fetches the booking from Supabase. It checks `booking.approval_status === 'approved'` and `booking.payment_status !== 'completed'`. If so, it shows the "Pay Initial Deposit" button.

When the button is tapped, `BookingDetails.tsx` navigates to `Payments` with these params (lines ~388–404):
```typescript
navigation.navigate('Payments', {
  listingId: booking.listing_id,
  amount: booking.caution_fee + 5000,  // display hint only
  description: 'Initial booking payment',
  receiverPhone: booking.listing?.landlord?.phone,
  receiverName: booking.listing?.landlord?.full_name,
  bookingId: booking.id,
  landlordId: booking.landlord_id,
  paymentType: 'initial',
  listingType: booking.listing?.listing_type || 'Apartment',
})
```

**Step 2 — PaymentScreen receives params**

`PaymentScreen.tsx` reads `incoming.bookingId` and `incoming.paymentType`. Because both are present, it knows this is a booking payment and will use `initiateBookingPayment` (the secure path), NOT `initiateTransfer`.

The `amount` in nav params is for *display only* in the input field (so the student can see what they'll be charged). It is never sent to the backend.

**Step 3 — Student enters their MoMo number and taps "Pay"**

`handleSendPayment()` at line 207 detects `incoming.bookingId && incoming.paymentType`, and dispatches:
```typescript
dispatch(initiateBookingPayment({
  bookingId: incoming.bookingId,      // 'abc-123'
  payerPhone: '651098669',            // Student's own phone
  paymentKind: 'initial',
  idempotencyKey: 'dhub-booking-abc-123-initial'
}))
```

**Step 4 — Redux thunk calls the backend**

`paymentsSlice.ts` dispatches `paymentService.initiateBookingPayment()` which POSTs to `POST /api/payments/booking-intents`.

**Step 5 — Backend validates everything**

`initiateDhubBookingPayment()` in `payment.service.ts`:
- Checks idempotency key hasn't been used before
- Fetches booking from Supabase: `caution_fee = 30000`, `total_amount = 80000`
- Fetches student's profile: their registered phone is `651098669` — matches
- Fetches landlord's MoMo number: `674414090`
- Reads `transfer_types` for `type_code = 'rent'`: `flat_fee = 5000`
- Calculates: `amount = caution_fee + flat_fee = 30000 + 5000 = 35000 XAF`

**Step 6 — MoMo Collection API is called**

`provider.requestToPay(35000, '651098669', referenceId)` sends a USSD push to the student's phone. The student sees "DHUB requires 35,000 XAF. Approve?" and enters their MoMo PIN.

**Step 7 — MoMo sends a webhook**

MTN MoMo POSTs `{ status: 'SUCCESSFUL', externalId: '<referenceId>' }` to `POST /api/webhooks/momo`.

**Step 8 — Webhook handler processes the result**

`handleWebhook()` runs:
1. Finds the payment by `reference_id`
2. Updates `status = 'SUCCESSFUL'`
3. Adds 5,000 XAF (platform_fee) to `account_details.total_earnings`
4. Updates Supabase: `bookings.payment_status = 'completed'`, `bookings.status = 'confirmed'`
5. Payment type is `'collection'` (not `'transfer'`), so NO disbursement is triggered — Dhub keeps the deposit.

**Step 9 — Mobile app gets notified**

`PaymentScreen.tsx` has a Supabase realtime subscription on the `payments` table filtered by `payer_id`. The Supabase row was upserted by `upsertDhubPayment()` in the webhook handler. The realtime event fires, the Redux store updates, and the UI shows the payment as `SUCCESSFUL`.

---

### Scenario: Student Pays Rent Completion

This is triggered by the "Pay Rent" button in `BookingDetails.tsx` at lines ~409–418.

**What changes vs. Initial Deposit:**
- `paymentType: 'rent_completion'`
- `paymentKind: 'rent_completion'` sent to backend
- Backend calculates: `amount = total_amount - caution_fee`
  - e.g. `80000 - 30000 = 50000 XAF`
- `payment_type` is set to `'transfer'` (money must reach landlord)
- `receiver_phone` is set to landlord's MoMo number

After MoMo confirms SUCCESSFUL:
- The webhook handler updates `bookings.rent_payment_status = 'completed'`
- HOWEVER: disbursement is NOT immediately triggered because `payment_kind === 'rent_completion'` and this is an escrow-held payment (`payout_status = 'HELD'`)
- The escrow is released via `POST /api/escrow/release` after both landlord and tenant confirm move-in via the app

---

### Scenario: Landlord Boosts a Listing

**Step 1 — `BoostScreen.tsx` opens**

On mount, it fetches:
```typescript
const { data, error } = await supabase
  .from('boost_plans')
  .select('*')
  .eq('active', true)
  .order('duration_days', { ascending: true });
```
This reads directly from the PostgreSQL `boost_plans` table that the admin dashboard writes to. Plans are displayed with their current prices.

**Step 2 — Landlord selects `plan7` (7 Days, 2,500 XAF)**

The app navigates to `LandlordPaymentScreen` with:
```typescript
{
  planId: 'plan7',
  durationDays: 7,
  price: 2500,  // display only
  purpose: 'boosting',
}
```

**Step 3 — Backend is called with ZERO amount**

`LandlordPaymentScreen.tsx` calls `initiateCollection`:
```typescript
{
  payerPhone: landlordPhone,
  reason: 'boosting',
  planId: 'plan7',
  // amount: deliberately omitted
}
```

**Step 4 — Backend enforces the price**

`initiatePayment()` in `payment.service.ts` line 159–163:
```typescript
if (reason === 'boosting') {
  if (!planId) throw new Error('planId is required for boosting payments');
  const planResult = await query(
    `SELECT price FROM boost_plans WHERE id = $1 AND active = TRUE`, [planId]
  );
  finalAmount = Number(planResult.rows[0].price);  // = 2500
}
```

Even if the app tried to send `amount: 1`, the backend ignores it and uses `2500` from the database.

---

## 7. ZERO-TRUST SECURITY MODEL

The security model is implemented across these files:

### 7.1 Authentication — `src/middleware/apiAuth.middleware.ts`

Every `/api/payments/*` route is wrapped in `requireUser`. This middleware:
1. Extracts the `Authorization: Bearer <token>` header
2. Calls `supabase.auth.getUser(token)` to validate the JWT with Supabase's auth server
3. Attaches `req.authUser = { id, email, role, ... }` to the request
4. Throws `401` if token is invalid, expired, or missing

The admin config API additionally uses `requireAdmin`, which calls `requireUser` then checks `req.authUser?.role === 'admin'`. Non-admin users receive `403 Forbidden`.

### 7.2 Price Enforcement

**The client NEVER controls the final charge amount** for:
- Booking payments (initial, rent_completion, renewal): Price is calculated from `bookings.total_amount` and `bookings.caution_fee` in Supabase
- Boost payments: Price is read from `boost_plans.price` via `planId`
- Subscription payments: Price is read from `subscription_tiers.price` via `tierId`

For generic rent transfers (`reason === 'rent'`, `paymentType === 'transfer'`), `amount` IS accepted from the client because this represents a direct payment scenario where the landlord and tenant agreed on an amount. The backend still validates that `amount > 0`.

### 7.3 Ownership Validation

The booking payment endpoint enforces:
```typescript
if (booking.student_id !== userId) throw new Error('You cannot pay for this booking.');
```
This prevents one student from paying on behalf of another.

### 7.4 Phone Validation

The payer's phone must match their Dhub profile:
```typescript
const registeredPhones = [payer?.phone, payer?.momo]
  .filter(Boolean)
  .map(phone => String(phone).replace(/\D/g, ''));
if (!registeredPhones.includes(normalizedPayer)) {
  throw new Error('Use the mobile-money number registered on your DHUB account.');
}
```
This prevents a student from paying with a stolen phone.

### 7.5 Idempotency

Every payment has a unique `idempotency_key`. Before processing:
```typescript
const existing = await query(
  `SELECT * FROM payments WHERE idempotency_key = $1`, [idempotencyKey]
);
if (existing.rows.length) return existing.rows[0];
```
If the same key arrives again (network retry, double-tap), the backend returns the existing result without charging again.

### 7.6 Webhook Guard

The webhook handler prevents duplicate processing:
```typescript
if (payment.status !== 'PENDING') {
  console.log(`Payment already processed`);
  return;
}
```
Even if MTN sends 10 SUCCESSFUL callbacks, disbursement only fires once.

---

## 8. ADMIN DASHBOARD — UI AND CONFIG MANAGEMENT

The admin dashboard is a server-side rendered EJS application served at `/admin/*` on the Render deployment.

### 8.1 Accessing the Dashboard

URL: `https://your-render-domain/admin/login`  
Credentials: `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env` / Render environment variables.

### 8.2 Dashboard Page (`/admin/dashboard`)

Shows:
- Total transfer volume and platform fees collected
- Total collection revenue
- Combined platform revenue
- Filterable, paginated transaction table (filter by status, payment type, reason, date range)
- Daily volume chart (Chart.js)
- Settings panel (switch between MoMo sandbox/live and Fapshi)

### 8.3 Transfer Types Page (`/admin/transfer-types`)

This is where you set the fee percentage or flat fee for each listing category.

**Example:** To increase the commission for hotel listings to 5%:
1. Go to `/admin/transfer-types`
2. Find `hotel` row
3. Change `percentage_fee` from `2.50` to `5.00`
4. Click Update

The change takes effect **immediately** for all subsequent payments. Existing pending payments are not affected.

### 8.4 Boost Plans Page (`/admin/boost-plans`) [NEW]

Displays a card for each boost plan with an edit form:
- **Label**: Human-readable name shown in the app
- **Duration (days)**: How long the boost lasts
- **Price (XAF)**: What the landlord is charged (enforced server-side)
- **Active toggle**: If disabled, plan disappears from the app immediately

When saved, `UPDATE boost_plans SET ... WHERE id = $1` runs directly. The `BoostScreen.tsx` in the mobile app fetches fresh data every time it opens, so the next time a landlord visits the boost screen, they see the updated prices.

### 8.5 Subscription Tiers Page (`/admin/subscription-tiers`) [NEW]

Same pattern as Boost Plans but for landlord subscriptions:
- **Tier Name**: Display name
- **Duration (days)**
- **Price (XAF)**: Enforced by backend when `tierId` is passed
- **Features**: One per line in the textarea — stored as a JSON array
- **Active toggle**

### 8.6 Feature Flags (`/admin/feature-flags`)

Controls optional features system-wide. Currently manages:
- `active_payment_provider`: switches all new payments to use either `momo` or `fapshi`
- `momo_environment`: switches between `sandbox` (test) and `live` (production)

---

## 9. MOBILE APP — HOW SCREENS CALL THE BACKEND

### 9.1 `BoostScreen.tsx` (Landlord)

**File:** `Dhub/src/screens/landlord/BoostScreen.tsx`

On mount, fetches boost plans directly from Supabase:
```typescript
const { data } = await supabase
  .from('boost_plans')
  .select('*')
  .eq('active', true)
  .order('duration_days', { ascending: true });
```

When a plan is selected and confirmed, navigates to `LandlordPaymentScreen` passing `planId` and `price` (display only).

### 9.2 `LandlordPaymentScreen.tsx`

**File:** `Dhub/src/screens/landlord/PaymentScreen.tsx`

Calls `initiateCollection` with `planId` set, no `amount`:
```typescript
dispatch(initiateCollection({
  payerPhone: landlordPhone,
  reason: 'boosting',
  planId: selectedPlan.id,
  client: { ... }
}))
```

### 9.3 `BookingDetails.tsx` (Student)

**File:** `Dhub/src/screens/student/BookingDetails.tsx`

Three payment triggers:
1. Initial deposit button → navigates to `Payments` with `paymentType: 'initial'`
2. Pay rent button → navigates to `Payments` with `paymentType: 'rent_completion'`
3. Renewal button → navigates to `Payments` with `paymentType: 'renewal'`

All three pass `bookingId` so `PaymentScreen` uses the secure `initiateBookingPayment` path.

### 9.4 `PaymentScreen.tsx` (Student)

**File:** `Dhub/src/screens/student/PaymentScreen.tsx`

Decision tree in `handleSendPayment()` (line 207):
```
if incoming.bookingId && incoming.paymentType:
  → dispatch(initiateBookingPayment(...))   ← secure, amount from DB
else:
  → dispatch(initiateTransfer(...))          ← generic, amount from user input
```

The secure booking path sends:
```typescript
{
  bookingId: incoming.bookingId,
  payerPhone: payerPhone,
  paymentKind: incoming.paymentType,
  idempotencyKey: `dhub-booking-${bookingId}-${paymentType}`
}
```

### 9.5 `paymentService.ts`

**File:** `Dhub/src/services/paymentService.ts`

Three service methods:
- `initiateCollection(args)` → `POST /api/payments/collection`
- `initiateTransfer(args)` → `POST /api/payments/transfer`
- `initiateBookingPayment(args)` → `POST /api/payments/booking-intents`
- `fetchPayments(userId)` → reads from Supabase `payments` table directly (no backend call needed)

All attach the Supabase session JWT in the `Authorization` header via `getAuthHeaders()`.

---

## 10. DYNAMIC PRICING — HOW IT WORKS END-TO-END

This section traces a single number (the 2,500 XAF price for a 7-day boost) through the entire system.

### Where it lives
In the PostgreSQL `boost_plans` table row with `id = 'plan7'`:
```
id: 'plan7', label: '7 Days Boost', duration_days: 7, price: 2500.00, active: true
```

### Who writes it
The admin at `/admin/boost-plans` submits:
```html
<form action="/admin/boost-plans/plan7" method="POST">
  <input name="price" value="2500">
  ...
```

The controller (`admin.controller.ts`, `updateBoostPlanAdmin()`):
```typescript
await query(
  `UPDATE boost_plans SET price = $3, ... WHERE id = $5`,
  [..., parsedPrice, ..., 'plan7']
);
```

### Who reads it (mobile app display)
`BoostScreen.tsx` on mount:
```typescript
supabase.from('boost_plans').select('*').eq('active', true)
→ returns [{ id: 'plan7', price: 2500, ... }]
→ displayed as "XAF 2,500"
```

### Who enforces it (payment)
`payment.service.ts` when `reason === 'boosting'`:
```typescript
const planResult = await query(
  `SELECT price FROM boost_plans WHERE id = $1 AND active = TRUE`, ['plan7']
);
finalAmount = Number(planResult.rows[0].price);  // = 2500
```
The `finalAmount` is what gets passed to `provider.requestToPay(2500, ...)`.

### If admin changes the price to 3,500
1. Admin updates in dashboard → `UPDATE boost_plans SET price = 3500 WHERE id = 'plan7'`
2. Next time a landlord opens `BoostScreen.tsx` → Supabase returns `price: 3500` → display shows 3,500 XAF
3. Next time a landlord pays for a 7-day boost → backend reads `price = 3500` from DB → MoMo prompts for 3,500 XAF
4. No code was changed. No app redeployment needed.

---

## 11. MOMO vs FAPSHI — PROVIDER STRATEGY PATTERN

The `PaymentProviderStrategy` in `src/services/paymentProvider.strategy.ts` loads the `platform_settings` table and returns either `collectionService`/`disbursementService` (MoMo) or `fapshiService` (Fapshi).

### MoMo Implementation

**Collection:** `src/services/collection.service.ts`
- Auth: `POST /collection/token/` with Basic auth (`MOMO_COLLECTION_USER_ID:MOMO_COLLECTION_API_KEY` base64 encoded)
- Payment request: `POST /collection/v1_0/requesttopay`
- Key headers: `X-Reference-Id` (our UUID), `X-Target-Environment` (`sandbox` or `live`), `X-Callback-Url` (our webhook URL)

**Disbursement:** `src/services/disbursement.service.ts`
- Auth: `POST /disbursement/token/` with Basic auth (`MOMO_DISBURSEMENT_USER_ID:MOMO_DISBURSEMENT_API_KEY`)
- Transfer: `POST /disbursement/v1_0/transfer`

**Merchant Account:** Configured entirely on the MTN MoMo Developer Portal (developer.mtn.com). The merchant wallet that receives collected funds is the account tied to your API keys. No phone number is specified in code — it's implicit from the API keys.

### Fapshi Implementation

**File:** `src/services/fapshi.service.ts`
- Collection: `POST https://live.fapshi.com/api/direct-pay`
- Disbursement (payout): `POST https://live.fapshi.com/api/payout`
- Auth: `apiuser` and `apikey` headers (from `FAPSHI_API_USER`, `FAPSHI_API_KEY` env vars)

To switch the entire system to Fapshi:
1. Go to `/admin/dashboard`
2. In the Settings panel, set `Active Provider` to `fapshi`
3. Save

All future payments route through Fapshi. Existing pending MoMo payments are not affected.

---

## 12. TEST SCENARIOS AND CASE STUDIES

### Test Case 1: Initial Booking Payment — Happy Path

**Setup:**
- Student `userId = 'stu-1'` with phone `651098669` registered
- Booking `id = 'bk-1'`, `student_id = 'stu-1'`, `approval_status = 'approved'`, `caution_fee = 20000`, `total_amount = 70000`
- Landlord `id = 'll-1'`, `momo = '674414090'`
- MoMo environment: sandbox

**Steps:**
1. Student opens BookingDetails → sees "Pay Deposit" button
2. Taps button → navigates to PaymentScreen with `bookingId: 'bk-1'`, `paymentType: 'initial'`
3. Enters phone `651098669`, taps Pay
4. App POSTs to `/api/payments/booking-intents`:
   ```json
   { "bookingId": "bk-1", "payerPhone": "651098669", "paymentKind": "initial", "idempotencyKey": "dhub-booking-bk-1-initial" }
   ```
5. Backend calculates: `20000 + 5000 = 25000 XAF`
6. MoMo sandbox sends push to `651098669`
7. Student "approves" in sandbox
8. MoMo POSTs webhook: `{ status: 'SUCCESSFUL' }`
9. Backend updates `bookings.payment_status = 'completed'`
10. Student's PaymentScreen shows SUCCESSFUL

**Expected result:** Booking confirmed, deposit held by Dhub, no disbursement.

**Failure scenarios to test:**
- Send wrong phone `679000000` → error: "Use the mobile-money number registered on your DHUB account"
- Send same `idempotencyKey` twice → second call returns the first result, no double charge
- Send `bookingId` of a non-approved booking → error: "This booking is not eligible for payment"

---

### Test Case 2: Boost Payment — Admin Changes Price Mid-Test

**Setup:**
- Admin sets `boost_plans` → `plan1` → price = `500`
- Landlord opens BoostScreen → sees "1 Day Boost — 500 XAF"
- Admin changes price to `800` in dashboard

**Test A (price before change):**
- Landlord already selected plan1 and is on payment screen (price = 500 shown)
- Lands pay → backend reads DB → finds `price = 800` → MoMo prompts for 800

**Lesson:** The display price in the app is a hint only. The backend enforces whatever is in the DB at the moment of payment. If admin changes price between screen load and payment, the charged amount reflects the new price. This is correct behavior (price is DB-authoritative).

**Test B (inactive plan):**
- Admin sets `plan1.active = false` (toggle off in dashboard)
- Next time landlord opens BoostScreen: `plan1` disappears (filtered by `active = true`)
- If somehow the app sends `planId: 'plan1'` anyway: backend returns `Invalid or inactive boost plan: plan1`

---

### Test Case 3: transferType Case Sensitivity

**What was broken (bug, resolved 2026-07-21):**
- Listing type `'Apartment'` was stored in Dhub's Supabase as `'Apartment'` (capital A)
- Mobile app passed `transferType: 'Apartment'` to the backend
- Backend queried `WHERE type_code = 'Apartment'` — found nothing — threw `Invalid transferType: Apartment`

**Fix applied in `payment.service.ts` line 188:**
```typescript
const typeResult = await query(
  `SELECT * FROM transfer_types WHERE LOWER(type_code) = $1 AND active = TRUE`,
  [transferType.toLowerCase()]
);
```

Now `'Apartment'`, `'apartment'`, `'APARTMENT'` all resolve to the `apartment` row.

---

### Test Case 4: Legacy `amount` Column NOT NULL Crash

**What was broken (bug, resolved 2026-07-21):**
- The original payments table was created with an `amount DECIMAL NOT NULL` column
- When the schema evolved to use `total_amount`, `platform_fee`, and `receiver_amount`, the `amount` column was left in the DB but the INSERT query stopped writing to it
- Postgres rejected any new INSERT because `amount` had no default and was NOT NULL
- Error: `null value in column "amount" of relation "payments" violates not-null constraint`

**Fix applied in `src/config/db.ts`:**
```typescript
const fixLegacyAmountColumnQuery = `
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name = 'amount'
    ) THEN
      ALTER TABLE payments
        ALTER COLUMN amount DROP NOT NULL,
        ALTER COLUMN amount SET DEFAULT 0;
    END IF;
  END $$;
`;
```

This runs on every boot. It's idempotent (uses `IF EXISTS`). If the column never existed, it does nothing. If it exists and is still NOT NULL, it fixes it.

**To verify after deploy:** Check Render logs on boot for `Database initialized successfully: tables ready.` — if this appears, the migration ran without error.

---

### Test Case 5: Rent Amount is Always From the DB, Never From the Client

**Narrative:** A technically proficient user intercepts the network traffic between the app and the backend using a MITM proxy. They modify the request payload:

```json
{ "bookingId": "bk-42", "payerPhone": "651098669", "paymentKind": "rent_completion", "amount": 1 }
```

They have injected `amount: 1` hoping to pay only 1 XAF.

**What happens on the backend:**

`initiateDhubBookingPayment()` never reads `amount` from the request body. The function signature is:
```typescript
static async initiateDhubBookingPayment({
  userId, payerPhone, bookingId, paymentKind, idempotencyKey
}: { ... })
```

The backend fetches the booking:
```
total_amount = 80000, caution_fee = 30000
```

For `rent_completion`, it calculates: `80000 - 30000 = 50000 XAF`.

The MoMo request is for `50000` XAF regardless of what the attacker sent. The injected `amount: 1` is silently ignored because it's not part of the function's parameter destructuring.

---

### Test Case 6: Idempotency Under Poor Network Conditions

**Narrative:** A student's phone loses 4G signal mid-payment. The POST to `/api/payments/booking-intents` reaches the server and creates the payment, but the HTTP response times out before reaching the phone. The student's app retries the request.

**First request (succeeds, response lost):**
- `idempotencyKey: 'dhub-booking-bk-55-initial'`
- Payment record created, MoMo push sent
- DB: `payments.idempotency_key = 'dhub-booking-bk-55-initial'`

**Second request (retry):**
- Same `idempotencyKey: 'dhub-booking-bk-55-initial'`
- Backend runs: `SELECT * FROM payments WHERE idempotency_key = $1`
- Finds the existing record
- Returns it immediately: `return payment;`
- **No second MoMo push sent. No double charge.**

The student gets the response as if it was fresh. MoMo has already been called once.

---

### Test Case 7: Sandbox to Live Migration

**Steps:**
1. Ensure all sandbox tests pass (see Test Cases 1–6 above with MoMo sandbox credentials)
2. Log in to MTN Developer Portal, create a Live Collection product and Live Disbursement product
3. Get live API keys and User IDs
4. Update Render environment variables:
   ```
   MOMO_COLLECTION_USER_ID=<live-value>
   MOMO_COLLECTION_API_KEY=<live-value>
   MOMO_DISBURSEMENT_USER_ID=<live-value>
   MOMO_DISBURSEMENT_API_KEY=<live-value>
   ```
5. In the admin dashboard `/admin/dashboard` → Settings → switch `MoMo Environment` to `live`
6. Trigger a Render redeploy (or the `syncMomoConfig()` call triggered by the settings save will handle it dynamically)
7. Test with a real 500 XAF transaction before going fully live

**What NOT to do:**
- Do not change `NODE_ENV` to production manually without also updating MoMo credentials — it will cause authentication failures silently
- Do not run sandbox and live on the same database simultaneously (reference IDs may collide in edge cases)

---

## 13. KNOWN BUGS, ROOT CAUSES, AND FIXES

### Bug 1: `Invalid transferType: apartment`

**Symptom:**
```
ERROR  ❌ [PaymentService] Transfer Failed: {"error": "Invalid transferType: apartment", "success": false}
```

**Root cause:** The `transfer_types` table was empty. `initDb()` did not previously seed it. The backend looked up `apartment` in an empty table and found nothing.

**Fix (2026-07-21):**
1. Added `initializeTransferTypesQuery` to `db.ts` — seeds all listing types on boot
2. Made lookup case-insensitive via `LOWER(type_code) = LOWER($1)` in `payment.service.ts`

**Status:** Fixed. Redeploy required.

---

### Bug 2: `null value in column "amount" of relation "payments"`

**Symptom:**
```
"details": "null value in column \"amount\" of relation \"payments\" violates not-null constraint"
```

**Root cause:** The `payments` table had an old `amount NOT NULL` column from a prior schema iteration. The current INSERT query only writes to `total_amount`, leaving `amount` NULL, which Postgres rejected.

**Fix (2026-07-21):**
Added `fixLegacyAmountColumnQuery` to `db.ts` — runs on every boot, drops NOT NULL constraint and sets default 0 on the `amount` column if it exists.

**Status:** Fixed. Next Render deploy + boot will auto-apply the migration.

---

### Bug 3: Boost plans not showing in app

**Symptom:** `BoostScreen` shows spinner indefinitely or shows "No plans available."

**Root cause:** The `boost_plans` table in the local PostgreSQL DB had no rows seeded.

**Fix:** `initializeBoostPlansQuery` was already present in `db.ts` and seeds 4 default plans on first boot.

**Note:** `BoostScreen.tsx` reads from Supabase (`supabase.from('boost_plans')`), NOT the local PostgreSQL. The admin dashboard writes to local PostgreSQL. These are **the same database** because Supabase IS the PostgreSQL instance (the backend connects to it via `DATABASE_URL`). As long as `DATABASE_URL` points to the Supabase connection string, both the app and the backend see the same data.

**Action required if this bug occurs:** Verify that `DATABASE_URL` in Render environment variables is the Supabase PostgreSQL pooler URL, not a separate local Postgres.

---

### Bug 4: Webhook not being received (MoMo sandbox)

**Symptom:** Payment shows PENDING indefinitely. No webhook arrives.

**Root cause candidates:**
1. `MOMO_WEBHOOK_BASE_URL` is not set, so the `X-Callback-Url` header sent to MoMo is empty or wrong
2. Render's HTTPS URL is not publicly accessible (very unlikely on Render)
3. MoMo sandbox simulates callbacks with a delay (up to 2 minutes)

**Fix:**
- Ensure `MOMO_WEBHOOK_BASE_URL` in `.env` matches the exact Render URL, e.g. `https://dhub-payment.onrender.com`
- The `X-Callback-Url` set in `collection.service.ts` line 68 is: `${momoConfig.webhookBaseUrl}/api/webhooks/momo`
- Manually trigger a status sync by calling `GET /api/payments/:referenceId` — the backend will poll MoMo for the current status and process the webhook locally if MoMo shows SUCCESSFUL

---

### Bug 5: Admin login fails

**Symptom:** Login page shows "Invalid email or password" even with correct credentials.

**Root cause:** Trailing whitespace in `.env` file values. `ADMIN_EMAIL=admin@dhub.com ` (note trailing space).

**Fix:** Both the env var and the submitted form value are `.trim()`'d in `admin.controller.ts` line 18:
```typescript
const adminEmail = process.env.ADMIN_EMAIL?.trim();
const submittedEmail = email?.trim();
```

If this still fails, check Render's environment variables panel and ensure there are no hidden whitespace characters.

---

## 14. ENVIRONMENT VARIABLES REFERENCE

All variables required in `.env` (local) and Render Environment Variables panel (production):

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | `postgresql://postgres:[pwd]@db.xxx.supabase.co:5432/postgres` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend use only) | `eyJ...` |
| `MOMO_COLLECTION_USER_ID` | MTN MoMo Collection API user ID | `uuid` |
| `MOMO_COLLECTION_API_KEY` | MTN MoMo Collection API key | `string` |
| `MOMO_COLLECTION_SUBSCRIPTION_KEY` | MTN MoMo Collection subscription key | `string` |
| `MOMO_DISBURSEMENT_USER_ID` | MTN MoMo Disbursement API user ID | `uuid` |
| `MOMO_DISBURSEMENT_API_KEY` | MTN MoMo Disbursement API key | `string` |
| `MOMO_DISBURSEMENT_SUBSCRIPTION_KEY` | MTN MoMo Disbursement subscription key | `string` |
| `MOMO_ENVIRONMENT` | `sandbox` or `live` | `sandbox` |
| `MOMO_WEBHOOK_BASE_URL` | Public HTTPS URL of this server | `https://dhub-payment.onrender.com` |
| `MOMO_CURRENCY` | Currency code for MoMo | `XAF` |
| `FAPSHI_API_USER` | Fapshi API username | `string` |
| `FAPSHI_API_KEY` | Fapshi API key | `string` |
| `ADMIN_EMAIL` | Admin dashboard login email | `admin@dhub.com` |
| `ADMIN_PASSWORD` | Admin dashboard login password | `strong-password` |
| `SESSION_SECRET` | Express session secret (long random string) | `abc123...` |
| `PORT` | Server port (Render sets this automatically) | `4321` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | `https://dhubcmr.netlify.app` |

**Mobile App Variables (Dhub, `app.config.js` / `.env`):**

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_DIRA_PAYMENT_URL` | Base URL of the payment backend | `https://dhub-payment.onrender.com` |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

---

## 15. DEPLOYMENT CHECKLIST (RENDER)

Before deploying a new version of `dhubpayment-main` to Render:

**Pre-deploy:**
- [ ] Run `npx tsc --noEmit` locally — 0 errors required
- [ ] Verify all new environment variables are set in Render dashboard
- [ ] Verify `MOMO_WEBHOOK_BASE_URL` is set to the correct Render URL
- [ ] If adding new DB tables/columns: confirm `initDb()` SQL is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)

**Post-deploy verification:**
- [ ] Check Render logs: `Database initialized successfully: tables ready.` must appear within 30 seconds of boot
- [ ] Hit `GET /health` — should return `{ success: true, status: 'OK' }`
- [ ] Log in to `/admin/dashboard` — page should load with stats
- [ ] Visit `/admin/boost-plans` — should show 4 boost plans
- [ ] Visit `/admin/subscription-tiers` — should show 3 tiers
- [ ] Visit `/admin/transfer-types` — should show 7 rows (apartment, room, studio, house, guest_house, hotel, rent)
- [ ] Initiate a sandbox test payment from the mobile app — check Render logs for `Successfully initiated requestToPay`
- [ ] Wait for MoMo sandbox callback or manually call `GET /api/payments/:referenceId` — verify status transitions from PENDING to SUCCESSFUL

**If any of the above fail, check:**
1. Render build logs for TypeScript compilation errors
2. Render runtime logs for `Failed to initialize database`
3. `DATABASE_URL` is correctly set and the Supabase DB is accessible from Render's IP range
