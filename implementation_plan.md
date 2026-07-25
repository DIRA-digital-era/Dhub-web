```md
# DHUB Payments Implementation Plan

> **Handover to Engineering**  
> This document details the end-to-end architecture, security fixes, and step-by-step implementation of the DHUB dual-payment system. The goal is a secure, webhook-driven escrow flow that works reliably even on unstable Bamenda networks, with a zero-code transition from Fapshi to native MoMo on July 20th.

---

## 1. High‑Level Architecture

The payment system is powered by the **Dira Payments Microservice** (`dhubpayment.onrender.com`), a Node.js/TypeScript Express app with a dedicated PostgreSQL instance. It follows a strict three‑layer pattern:

| Layer        | Responsibility                                                                                       |
|--------------|------------------------------------------------------------------------------------------------------|
| **API Layer** (`/controllers`) | Handles HTTP requests (payment initiation, polling) and webhooks. Never contains business logic.     |
| **Service Layer** (`/services`) | Orchestrates payments. Key modules: `CollectionService`, `DisbursementService`, `PaymentRouter`.    |
| **Config Layer** (`/config`)   | Loads environment‑driven secrets (API keys, multiple sandbox users, feature flags).                 |

The system uses a **Router Pattern** governed by a database feature flag to switch between Fapshi and native carrier integrations without redeploying the mobile app.

---

## 2. Security Fixes (Critical – Immediate Action Required)

### 2.1 Remove Client‑Side Authority Over Booking Status

**Problem:** `PaymentScreen.tsx` contains `markBookingPaymentCompleted()`, which allows the mobile app to update `bookings.status` directly. A malicious user can spoof this call to unlock an address without paying.

**Fix:**  
- Enable **Row Level Security (RLS)** on the `bookings` and `payments` tables.  
- Grant `UPDATE` permission on the `status` column **only** to the `service_role`.  
- The mobile app must never call an update query for payment or booking status.

```sql
-- Example RLS policy (apply via Supabase dashboard or migration)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only service role can update status"
ON bookings FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

### 2.2 Validate All Webhook Payloads

**Problem:** An attacker can POST a fake `SUCCESSFUL` payload directly to your webhook endpoint, bypassing payment.

**Fix:**  
- Configure a **webhook secret** in the Fapshi dashboard.  
- In your webhook controller, verify the `x-wh-secret` header before processing any data.

```typescript
// controllers/webhookController.ts
export const handleFapshiWebhook = async (req, res) => {
  const secret = req.headers['x-wh-secret'];
  if (secret !== process.env.FAPSHI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ... process webhook
};
```

### 2.3 Enforce Idempotency for All Payment Attempts

**Problem:** Network drops in Bamenda can cause users to tap “Pay” multiple times, risking double charges.

**Fix:**  
- Generate a UUID v4 `idempotency_key` on the mobile app the moment the user presses “Pay”.  
- The backend must perform an **upsert** on the `payments` table using this key. If the key already exists, return the existing transaction status instead of creating a new charge.

```typescript
// Inside PaymentRouter
const existing = await db.payment.findUnique({ where: { idempotencyKey } });
if (existing) return { status: existing.status, transId: existing.transId };

const payment = await db.payment.create({ data: { idempotencyKey, amount, ... } });
// proceed to Fapshi / native MoMo
```

### 2.4 Feature Flag Must Be Resolved Server‑Side

**Problem:** `loadStudentPaymentFeatureFlag()` is called on the frontend. A user can intercept the response and force the app to use an insecure mock provider.

**Fix:**  
- Remove all payment routing logic from the mobile app.  
- The app simply sends a `POST /api/payments` request. The backend reads the `GATEWAY_STRATEGY` flag from the database and selects the appropriate service internally. The client never knows which gateway is being used.

---

## 3. Feature Flag & Database Preparation

Create the `public.feature_flags` table if it doesn’t exist:

```sql
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.feature_flags (key, value)
VALUES ('GATEWAY_STRATEGY', 'FAPSHI_AGGREGATOR')
ON CONFLICT (key) DO NOTHING;
```

**Values:**  
- `'FAPSHI_AGGREGATOR'` – current, uses Fapshi for MoMo/Orange Money.  
- `'DHUB_NATIVE_MOMO'` – after July 20th, routes directly to MTN/Orange APIs.

---

## 4. Fapshi Integration (Phase 1)

### 4.1 Environment Variables (Render.com)

```
FAPSHI_USER=your_apiuser
FAPSHI_KEY=your_apikey
FAPSHI_WEBHOOK_SECRET=your_secret_set_in_dashboard
FAPSHI_BASE_URL=https://live.fapshi.com
```

### 4.2 Direct Pay Request

```typescript
// services/fapshiService.ts
import axios from 'axios';

export const initiateFapshiPayment = async (
  amount: number,
  phone: string,
  externalId: string,
  message: string
) => {
  const { FAPSHI_USER, FAPSHI_KEY, FAPSHI_BASE_URL } = process.env;
  const response = await axios.post(
    `${FAPSHI_BASE_URL}/direct-pay`,
    { amount, phone, externalId, message },
    { headers: { apiuser: FAPSHI_USER, apikey: FAPSHI_KEY } }
  );
  return response.data.transId;
};
```

### 4.3 Webhook Handling

- **Endpoint:** `POST /api/webhooks/fapshi` (publicly reachable at your Render domain).  
- **Logic:** Validate secret, update `payments` table status, and if successful → finalize booking (flip `listings.available` to false, set `bookings.status = 'confirmed'`).  
- **Idempotency:** Use `externalId` to ensure the webhook doesn’t double‑process the same transaction.

### 4.4 Revenue Impact

Fapshi charges **3% per collection**. Payouts (to landlords) are free.

| Transaction | Amount | Fapshi Fee | Net |
|-------------|--------|------------|-----|
| Service Fee | 5,000 XAF | 150 XAF | 4,850 XAF |
| Rent | 300,000 XAF | 9,000 XAF | 291,000 XAF |

This is an acceptable cost for speed‑to‑market before native registration on July 20th.

---

## 5. Payment Flow: Escrow Transfer (Rent + Caution)

1. **App:** After landlord approval, the tenant taps “Pay”.  
2. **App** calculates total = 5,000 XAF service fee + refundable caution/rent.  
3. **App** sends `POST /api/payments/transfer` with phone numbers, amount, and transfer type.  
4. **Backend (Router):**  
   - Reads `GATEWAY_STRATEGY`.  
   - Creates a local `payments` record (status `PENDING`) with the `idempotency_key`.  
   - Calls Fapshi `direct-pay` (or native MoMo `requesttopay`) to collect full amount from tenant.  
5. **Webhook** arrives → status becomes `SUCCESSFUL`.  
6. **Split calculation:** The backend calculates `platform_fee` (3‑5% of rent) and `receiver_amount` = total collected minus platform_fee.  
7. **Disbursement is locked** until both `tenant_confirmation` and `landlord_confirmation` are `true`.  
8. Once both toggles are on, the **Disbursement Service** triggers a payout (Fapshi `POST /payout` or native MoMo transfer) to the landlord’s wallet.

---

## 6. Mobile App Changes

### 6.1 Remove Direct Database Updates

- Delete `markBookingPaymentCompleted` and any client‑side call to `supabase.from('bookings').update({ status: 'confirmed' })`.  
- Replace with a simple status subscription via **Supabase Realtime** (or polling) to listen for changes from the backend.

### 6.2 Payment Button Logic

- The “Pay” button appears **only** when `booking.approval_status === 'approved'`.  
- Generate a UUID `idempotency_key` immediately on press.  
- Call your new backend endpoint (e.g., `POST /api/payments/initiate`).  
- Show a “MoMo prompt sent – waiting for PIN” screen with a manual “Check Status” button that calls `GET /api/payments/:refId` as a fallback for delayed webhooks.

### 6.3 Mutual Confirmation Toggles

- Add `tenant_confirmation` and `landlord_confirmation` columns to the `bookings` table.  
- Both tenants and landlords see a simple toggle in the app.  
- Tapping the toggle calls a backend function that logs the action and generates the **Official Digital Receipt** (sent via email with Resend).  
- The backend monitors both columns; when both are `true`, it releases the escrow payment automatically.

---

## 7. Native MoMo Transition (Phase 2 – July 20th)

Once DHUB is legally registered and has the native carrier credentials:

1. **Provision separate API users** for Collection and Disbursement in the carrier portal.  
2. **Store new keys** in environment variables (`MTN_COLLECTION_KEY`, etc.).  
3. **Set `GATEWAY_STRATEGY = 'DHUB_NATIVE_MOMO'`** in the `feature_flags` table.  
4. **No mobile app update required** – the backend router instantly begins using the new native modules.

**Important sandbox notes:**  
- Sandbox often forces `currency = 'EUR'`. Set `MOMO_CURRENCY=EUR` in your `.env` for testing.  
- Production must use `MOMO_CURRENCY=XAF`.  
- The webhook base URL registered with the carrier must exactly match your Render domain.

---

## 8. Deployment Checklist

- [ ] **Database:** Create `feature_flags` table, insert `GATEWAY_STRATEGY = 'FAPSHI_AGGREGATOR'`.  
- [ ] **RLS:** Enable on `bookings` and `payments`. Lock `status` column to `service_role`.  
- [ ] **Environment:** Add all Fapshi keys and webhook secret to Render.  
- [ ] **Backend:** Implement `PaymentRouter` with `fapshiService.ts`.  
- [ ] **Webhook:** Build `POST /api/webhooks/fapshi` with secret validation.  
- [ ] **Idempotency:** Add upsert logic using `idempotency_key`.  
- [ ] **Mobile:** Remove client‑side status updates, implement “Check Status” button.  
- [ ] **Toggles:** Add mutual confirmation UI and backend monitoring for auto‑payout.  
- [ ] **Testing:**  
  - Use Fapshi sandbox numbers (670000000) for internal beta.  
  - Simulate network drops: press “Pay” multiple times – only one charge must appear.  
  - Attempt a direct `POST` to the webhook without secret – must be rejected.  
  - Fake client update to `bookings.status` – must fail due to RLS.  
- [ ] **Geo‑Audit Setup:** Configure Postgres Cron to flag “Approved but Cancelled” listings for 72‑hour background location audit (optional, as per previous specs).

---

## 9. Critical Test Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 1 | Student pays via Fapshi, then app crashes. | Webhook updates DB; upon reopening, the address is unlocked. |
| 2 | Student taps “Pay” twice due to lag. | Only one transaction created. Second tap returns original status. |
| 3 | Attacker sends fake successful webhook. | Backend rejects because `x-wh-secret` is invalid. |
| 4 | Student cancels a paid booking and stays at the listing. | Geo‑audit detects proximity for 72h → flag for manual review. |
| 5 | July 20th – flip flag to `DHUB_NATIVE_MOMO`. | All new payments route to native MTN/Orange APIs; no app update needed. |

---

This plan provides a complete, secure, and developer‑ready pathway to launch the DHUB payment system with Fapshi today and transition to native MoMo seamlessly on July 20th. Hand it to your dev as the single source of truth for all payment‑related work.
```