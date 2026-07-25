# 🚀 Dhub - The Ultimate Student Housing & Real Estate Platform

![Dhub Hero Banner](./assets/screenshots/hero_banner.png)

Welcome to the **Dhub** repository! 
This `README.md` is not just a standard setup guide—it is an **exhaustive, hyper-detailed architectural breakdown and deep-dive post-mortem** of the entire application. It documents every domain model, every framework decision, and every single critical error encountered (and solved) across the entire lifecycle of Dhub's development.

---

## 📑 Table of Contents
1. [System Architecture & Stack](#1-system-architecture--stack)
2. [Data Models & Types](#2-data-models--types)
3. [Zero-Trust Security & Database Architecture](#3-zero-trust-security--database-architecture)
4. [Authentication & Persistence](#4-authentication--persistence)
5. [Escrow & Financial Orchestration](#5-escrow--financial-orchestration)
6. [Resumable Media Engine](#6-resumable-media-engine)
7. [The Great Bug Log: History of Errors & Fixes](#7-the-great-bug-log-history-of-errors--fixes)
8. [Deployment & EAS Build Matrix](#8-deployment--eas-build-matrix)

---

## 1. 🏗 System Architecture & Stack

Dhub is engineered for high performance, cross-platform native parity, and fraud-resistant financial operations:
*   **Core Framework**: React Native 0.81.5 (Nightly) on **Expo SDK 54**.
*   **Architecture**: New Architecture Enabled (`newArchEnabled: true` utilizing Fabric and TurboModules).
*   **State Management**: Redux Toolkit for synchronous in-memory UI manipulation, paired with `AsyncStorage` for robust offline-first hydration.
*   **Backend as a Service**: Supabase (PostgreSQL, Auth, Edge Functions, R2 Cloudflare Object Storage).
*   **Financial Orchestrator**: `dhubpayment-main` (Express.js on Render).
*   **Routing**: React Navigation (Tab & Stack layout).

![Architecture Flowchart](./assets/screenshots/architecture_flow.png)

---

## 2. 🧬 Data Models & Types

All domains are strictly defined in `src/types.ts`. Supabase database schemas directly reflect these interfaces.

### Core Extracted Interfaces
```typescript
// Roles strictly dictate the UI experience presented.
export type Role = 'student' | 'landlord' | 'mover' | 'admin';

// The Single Source of Truth for Properties
export interface ListingRow {
  id: string;
  title: string;
  price: number;
  city: string;
  media: MediaDBItem[]; // Raw R2 Bucket Keys
  landlord_id: string;
  processing_status?: 'processing' | 'ready' | 'failed'; // Crucial for Video States
}
```

---

## 3. 🛡️ Zero-Trust Security & Database Architecture

Dhub operates in a high-risk environment and relies on a strict **Zero-Trust Architecture**:
1. **Server-Authoritative State Machines**: Clients (Mobile App) cannot directly modify financial amounts or core state variables (`status`, `caution_status`, `payment_status`).
2. **Row-Level Security (RLS)**: The `bookings` table has an explicit lockdown preventing standard users from hijacking the lifecycle.
3. **RPC State Handshakes**: Landlords and students confirm move-ins and cancellations using strictly typed PostgreSQL `SECURITY DEFINER` RPCs (`confirm_handshake_side`, `set_booking_approval`, `cancel_booking`).
4. **Map Masking**: Geographic coordinates are truncated to 3 decimal places (~110m radius) via the `get_masked_listings` RPC, completely preventing offline poaching of listings unless a confirmed booking exists.
5. **Shadow Audit System**: A backend listener cron (`run_shadow_audit`) continuously monitors listing unavailability correlating with booking cancellations to detect evasion.

---

## 4. 🔐 Authentication & Persistence

Dhub utilizes a highly secure **Google OAuth PKCE Flow**, hardened with explicit prompt settings to prevent silent account hijacking (`prompt: 'consent select_account'`).

### Offline-First Architecture (`AppGate`)
We avoid UI flashing by physically locking the `RootNavigator` until `AsyncStorage` has pushed the cached auth token into Redux.

---

## 5. 💸 Escrow & Financial Orchestration

Payments and Escrow logic are delegated entirely to the `dhubpayment-main` microservice.
*   **Idempotency**: All network requests use deterministic, cryptographically strong `idempotencyKeys` preventing double charges on unstable 3G networks.
*   **Refund Queue**: Caution refunds (97% returned to the tenant, 3% platform fee) enter a strict 72-hour `refund_queued` holding state.
*   **Admin Overrides**: Administrators can actively pause refunds in review (`adminPauseEscrow`), pushing an immediate UI update via Supabase Realtime alerting the tenant to contact support.

---

## 6. 🎥 Resumable Media Engine

Large media payloads (video tours) crash typical JavaScript thread allocations.
*   Dhub utilizes a custom **Multipart Resumable Upload pipeline** chunking files into 8MB blocks.
*   The upload loops sequentially, saving `AsyncStorage` checkpoints to survive network drops.
*   Uploads can be explicitly aborted via an injected `AbortSignal`, gracefully closing the React Native networking thread.
*   To prevent the UI from attempting to stream uncompressed video directly, Dhub utilizes a `processing_status` state machine ('processing' | 'ready' | 'failed').

---

## 7. 🐞 The Great Bug Log: History of Errors & Fixes
The path to v1.0 was forged through fire. Below is the historical ledger of critical errors encountered and solved.

### 7.1 Android Release SIGABRT (`mqt_v_js`)
*   **The Error**: `Fatal signal 6 (SIGABRT), code -1 (SI_QUEUE) in tid 11574 (mqt_v_js)`
*   **The Root Cause**: Natively conflicting `react-native-reanimated/plugin` in Babel, combined with aggressive `Constants.expoConfig` early evaluations.
*   **The Fix**: Deleted redundant Babel configs, relying exclusively on standard Expo routing.

### 7.2 The Gradle Worker OOM Native Crash
*   **The Error**: `Failed to run Gradle Worker Daemon... timeout.`
*   **The Root Cause**: Expo's New Architecture (Fabric) requires massive C++ CMake compilations, draining an 8GB machine's RAM instantly.
*   **The Fix**: Bypassed local compilation by offloading builds to `eas build -p android --profile production`.

### 7.3 Supabase OAuth TypeScript Exceptions
*   **The Root Cause**: Attempted to pass `skipNonceCheck: true` internally in Supabase `ProviderOptions`, failing TS enforcement.
*   **The Fix**: Cleaned up the type interface and removed illegal properties.

### 7.4 Zero-Trust Privilege Escalations
*   **The Error**: A hijacked mobile client could bypass Escrow fees by manually updating `booking.caution_status = 'refunded'`.
*   **The Root Cause**: Initial iterations allowed authenticated clients full update permissions on their own rows.
*   **The Fix**: Implemented strict PostgeSQL RPCs and database triggers preventing client modifications to all structural lifecycle columns.

---

## 8. 🚀 Deployment & EAS Build Matrix
To execute builds:
1. **Sync Native Folders**: `npx expo prebuild --clean`
2. **Launch Universal Server**: `npx expo start -c`
3. **Cloud Compile Android**: `eas build --platform android --profile production`
4. **Cloud Compile iOS**: `eas build --platform ios --profile production`

*End of Document. Long live Dhub.*
