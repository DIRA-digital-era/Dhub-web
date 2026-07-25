# DHUB DEVELOPMENT BIBLE

Welcome to the **DHUB Development Bible**. This document serves as the absolute source of truth for the DHUB application architecture, development workflow, past debugging journeys, microservices integration, schema definitions, and production deployment pipelines. 

To any engineer reading this: The architecture herein is the product of extensive iterations. **Read this entirely before making structural changes.**

---

## TABLE OF CONTENTS
1. [Introduction, Vision, & Project Goals](#1-introduction-vision--project-goals)
2. [Core Technologies & Stack Details](#2-core-technologies--stack-details)
3. [Project Architecture & Directory Layout](#3-project-architecture--directory-layout)
4. [Authentication, OAuth, and Role Splitting (CRITICAL)](#4-authentication-oauth-and-role-splitting)
5. [Redux State Management & Hydration Lock](#5-redux-state-management--hydration-lock)
6. [Cross-Platform Media & FFmpeg Microservice](#6-cross-platform-media--ffmpeg-microservice)
7. [Android Gradle & Expo SDK Management](#7-android-gradle--expo-sdk-management)
8. [Supabase PostgreSQL Database Schema](#8-supabase-postgresql-database-schema)
9. [Edge Functions & Webhooks (SQL Triggers)](#9-edge-functions--webhooks-sql-triggers)
10. [Application Features & Flow Details](#10-application-features--flow-details)
11. [Component API & Custom Hooks](#11-component-api--custom-hooks)
12. [Debugging & Error Resolution Logs](#12-debugging--error-resolution-logs)
13. [UI Guidelines & Theme Constraints](#13-ui-guidelines--theme-constraints)
14. [Release Pipelines & App Updating](#14-release-pipelines--app-updating)
15. [Future Maintenance & Onboarding Tips](#15-future-maintenance--onboarding-tips)

---

## 1. INTRODUCTION, VISION, & PROJECT GOALS

**DHUB** is a unified PropTech mobile application built bridging the gap between University Students (tenants) and Landlords (property managers). The primary directive of DHUB is to eliminate fragmented communication, dangerous cash hand-offs, and predatory real-estate friction by centralizing bookings, maps, messaging, and automated payments inside a seamless interface.

For dummy developers reading this: If you do not understand a system, DO NOT overwrite it. Read this bible. We maintain rigorous role separation mathematically and at the database level. 

---

## 2. CORE TECHNOLOGIES & STACK DETAILS

The tech stack is optimized for velocity without sacrificing native API access on Android or iOS.

### 2.1 The Frontend Framework (React Native + Expo)
- **React Native Engine:** Utilizing the updated Fabric architecture where possible.
- **Expo Framework (Managed/Hybrid):** We use Expo SDK 54+. This allows us to use Over The Air (OTA) updates and Continuous Native Generation (CNG). 
- **Expo Router / React Navigation:** Stacks are implemented natively. Do not mix Hash routers from web dev with our native stack routers!

### 2.2 The Backend as a Service (BaaS)
- **Supabase (PostgreSQL):** Supabase runs our entire backend. It handles:
  - Auth (PostgreSQL Identity layer + JWT generation).
  - Real-time WebSockets (Postgres NOTIFY/LISTEN on chat tables).
  - Storage (Buckets).
  - Edge Functions (Deno scripts for automation).
- **Postgres RLS (Row Level Security):** Ensures malicious actors cannot query `select * from users`. Our application relies on RLS to filter what the client receives mathematically.

### 2.3 Microservices
- **Render.com Node.js Worker:** We built a custom microservice hosting a raw Linux FFmpeg wrapper. When iOS records a `.mov`, our worker intercepts it, crushes it into an optimized `.mp4` using H.264 profiles.
- **Cloudflare R2 Bucket:** Where these heavily optimized MP4s are stored passively.

---

## 3. PROJECT ARCHITECTURE & DIRECTORY LAYOUT

When onboarding, understand the structure:

```
DIRA_APPS/Dhub/
├── .expo/                   # Expo generated bundler cache (volatile, wipe if broken)
├── android/                 # Managed native Android drop (Do not manually touch settings.gradle)
├── app.config.js            # Expo Configuration (Maps API, SDKs, intent filters)
├── App.tsx                  # Root entry, Redux Provider, and Hydration Gate
├── supabase/
│   ├── functions/           # Deno Edge Functions
│   │   ├── new-listing-email/   # Broadcast emails
│   │   ├── booking-approved-email/
│   │   └── support-bot/
│   └── config.toml          # Local Supabase emulators
├── supabase_migrations.sql  # Tracked manually implemented SQL Triggers
├── src/
│   ├── components/          # Reusable UI Hooks
│   │   ├── MapPickerModal.tsx   # Complex native mapping wrapper
│   │   ├── ListingReviews.tsx   # Aggregators
│   │   └── GlobalNotification.tsx 
│   ├── hooks/               # Custom hooks for abstracting Redux logic
│   │   ├── useAuth.ts           # Accessors for dispatching login state
│   │   └── useVersionCheck.ts   # OTA Update logic
│   ├── navigation/          # Routing logic
│   │   ├── AuthStack.tsx        # Login/Registration
│   │   ├── StudentStack.tsx     # Student Flow
│   │   ├── LandlordStack.tsx    # Landlord Flow
│   │   └── RootNavigator.tsx    # The master switchboard
│   ├── screens/             # UI Visual logic
│   ├── store/               # Redux Slices 
│   │   ├── store.ts             # Contains master store & RESET reducers
│   │   └── authSlice.ts         # User auth memory payload
│   ├── types/               # TypeScript enums and interfaces
│   └── utils/               # Supabase client singleton setup
```

---

## 4. AUTHENTICATION, OAUTH, AND ROLE SPLITTING

DHUB transitioned from a legacy OTP model to a Google OAuth PKCE flow. 

### 4.1. Supabase OAuth Mechanisms
In Expo, using `signInWithOAuth` without strict configurations forces the operating system to attempt auto-login using the system web browser's cached cookies. 

**The Implementation:**
```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo,
    skipBrowserRedirect: true,
    queryParams: {
      prompt: 'consent select_account', // <-- THIS IS CRITICAL
    },
  },
});
```
This forces Google to show an Account Selection sheet. If you remove this, signing out and clicking "Sign In" will instantly log the user back into the cached account!

### 4.2. Deep Linking and Redirect URLs
To capture the JWT callback, Supabase must redirect back to the app using the OS specific intent.
- `app.config.js` declares `scheme: "dhub"`.
- Supabase Dashboard URL Configuration MUST have these wildcards:
  - `exp://**` (For your local Expo Go development)
  - `dhub://**` (For Android/iOS production .apk/.ipa)
  - `https://dhubweb.netlify.app/**` (For web deployments)

### 4.3. Restrictive Role Splitting
Role separation is paramount. You cannot sign up as a Student, decide you want to be a Landlord, and just "sign up" again with the same email.

**Data Bleeding Vulnerability Fixed:**
If a Student logged out, and tapped "Sign Up As Landlord", the App used to overwrite their role in the `users` table to "landlord". This meant their old student payments bled onto the Landlord Dashboard!
**How we fixed it:**
Inside `utils/login.ts` > `createSessionFromUrl`, if a `pending_profile` exists (meaning a user is currently signing up) BUT `dbUser` already possesses an ID, we strip the `pending_profile`!
```typescript
if (dbUser && pendingJson) {
  console.warn('Account already exists. Ignoring pending signup to prevent role mutation.');
  await AsyncStorage.removeItem('pending_profile');
}
```
If you want two accounts, you MUST use two separate Google Accounts or phone numbers.

### 4.4. Account Soft Deletions (`is_active`)
Standard relational databases despise hardware deletions.
Instead of calling a heavy generic delete, we utilize an `is_active` boolean on the `public.users` table schema.

- The application triggers an RPC: `supabase.rpc('delete_user')` and sets `is_active = false`.
- The frontend login routers check for this boolean:
  ```typescript
  if (dbUser && dbUser.is_active === false) {
    throw new Error('ACCOUNT_BANNED_OR_DELETED');
  }
  ```

---

## 5. REDUX STATE MANAGEMENT & HYDRATION LOCK

The entire application relies heavily on `store.ts`. 

### 5.1. Hydration Gatekeeper (`App.tsx`)
When the OS mounts the App, the UI halts at `<AppGate />`.
At this stage, `AuthListener` hits Supabase.
- Checks if a JWT token is cached natively securely.
- Connects to Postgres to load the User row.
- Feeds `dispatch(hydrateAuth(session))`.
Until `isHydrated` equals `true`, the UI stays completely frozen on the yellow DHUB `SplashScreen.tsx`. This absolutely prevents blank white screens.

### 5.2. Total State Annihilation (Logout Bleed Fix)
In standard Redux, logging out doesn't clear slices like `paymentsSlice`. If user 2 logs in on the same phone, they see user 1's payments until the API overwrites it!

**The Master Flush Reducer:**
```typescript
const rootReducer: Reducer = (state: ReturnType<typeof appReducer> | undefined, action: Action) => {
  if (action.type === 'auth/logout/fulfilled') {
    state = undefined; // Redux magic to wipe all cache
  }
  return appReducer(state, action);
};
```

---

## 6. CROSS-PLATFORM MEDIA & FFMPEG MICROSERVICE

Handling video uploads from diverse iOS codecs and varying Android hardware constraints broke standard Supabase Storage hooks.

### 6.1. The Pipeline
1. iOS `expo-image-picker` generates a chunked `.mov`.
2. DHUB client POSTs to Render Node.js instance.
3. Node triggers raw FFmpeg binary.
4. Output is strictly H.264 `mp4` with Web Optimized flags.
5. Pushed securely to Cloudflare R2 bucket.
6. Absolute URL synced back to `listing.media` JSON array.

---

## 7. ANDROID GRADLE & EXPO SDK MANAGEMENT

When updating Expo frameworks from SDK 51 to SDK 54, expect breaking linking errors (`Cannot find name 'Linking'`) and Kotlin mismatches.

### 7.1. Resolving Gradle Matrix Protocol Hell
NEVER modify `build.gradle` inside the `android/` folder manually on a managed Expo build!
You must perform an absolute matrix reset:
```bash
rm -rf node_modules .expo android ios package-lock.json
npm cache clean --force
npm install
npx expo prebuild --clean
```
Let Expo's Continuous Native Generation (CNG) rebuild the native directories utilizing `app.config.js` plugins!

---

## 8. SUPABASE POSTGRESQL DATABASE SCHEMA

For any engineer doing backend queries, here is your definitive schema map.

### 8.1 Critical Tables
- `users`: Core profile (`id, full_name, email, phone, role, is_active`).
- `student_profiles`: University tracking.
- `landlord_profiles`: Age, physical address, KYC tracking.
- `listings`: Rentable units (`landlord_id, price, location, boost_until, available`).
- `bookings`: Active transactions (`listing_id, student_id, status, approval_status`).
- `payments`: Stripe/Momo transaction logging (`provider, idempotency_key`).

### 8.2 JSONB Usage
Media blocks in `listings` are handled via JSONB arrays of MediaItem objects:
`[ { url: "R2_LINK", type: "video/image", thumbUrl: "..." } ]`

---

## 9. EDGE FUNCTIONS & WEBHOOKS (SQL TRIGGERS)

We removed thousands of lines of boilerplate API calls from the React codebase by instituting direct Database Triggers inside Postgres.

### 9.1 Booking Approvals
When a Landlord approves a booking (in `ApprovalScreen.tsx`), they only patch `bookings.approval_status = 'approved'`.
**What happens behind the scenes?**
A Postgres trigger `AFTER UPDATE ON bookings` catches the change.
1. It physically `INSERT`s a row into the `public.notifications` table for the student.
2. It executes an HTTP POST out to `supabase/functions/booking-approved-email`.
3. The Deno edge script spins up, imports the Resend SDK, and blasts an HTML email to the student: "Your Booking is Confirmed!".

### 9.2 New Listing Broadcasts
When a landlord clicks "Submit New Property", the `listings` table updates `available = true`.
**The Chain Reaction:**
A trigger `AFTER INSERT OR UPDATE ON listings` catches the truthy boolean. It calls `supabase/functions/new-listing-email`, providing the Title and City to fire off mass marketing sweeps!

---

## 10. APPLICATION FEATURES & FLOW DETAILS

### 10.1 Listing Details System & Map Unlocking
Landlords despise when non-paying students access exact geographical coordinates of un-secured properties. 

**The Map Render Protocol:**
In `ListingDetailsScreen.tsx`:
- The exact coordinate ping is loaded strictly mathematically.
- A `MapView` is loaded behind an absolute black-gradient blocking clicks (`scrollEnabled=false`).
- An overlay asks "Click for full screen".
- If the student taps it, the client calculates:
  ```typescript
  const isBoosted = listing.boost_until && new Date(listing.boost_until) > new Date();
  const canViewFullMap = hasPaidBooking || isBoosted;
  ```
- If false, the Alert denies transit to the `MapPickerModal` Fullscreen system. If true, full access is granted.

### 10.2 Gallery Swiping 
We implemented a `FlatList` with `pagingEnabled` combined with manual Left & Right React Native Chevron Navigators triggering a `useRef` bounded `scrollToIndex`.

---

## 11. COMPONENT API & CUSTOM HOOKS

Developers MUST stick to these standards.

### 11.1 useAuth Hook
Never import Redux slices directly for user access!
```typescript
import { useAuth } from '../../hooks/useAuth';
const { user, signOut, loading } = useAuth();
```

### 11.2 useVersionCheck Hook
This checks the `min_supported_version` against the current runtime artifact generated. If out of bounds, the App component halts and renders `UpdateRequiredScreen.tsx`.

---

## 12. DEBUGGING & ERROR RESOLUTION LOGS

A catalogue of nightmares we already survived. DO NOT reproduce these errors!

### 12.1 The `skipNonceCheck` TypeScript Collapse
**Error Type:** `Object literal may only specify known properties, and 'skipNonceCheck' does not exist in type 'SignInWithOAuthOptions'`
**History:** Supabase v1 required nonce stripping for some obscure iOS flows. Supabase v2 stripped this param structurally.
**Fix applied:** Remove the flag from `loginWithGoogle`. It is handled internally now.

### 12.2 The White Screen Netlify Glitch
**Error Type:** Web browser stalls on empty screen during authentication mount.
**History:** React attempts to sequentially render hooks demanding `$user.id`, but Netlify DOM didn't hold the `isHydrated` lock tightly.
**Fix applied:** `AppGate` rigorously intercepts returning `null` or a native simulated splash screen until absolute validation.

### 12.3 The "React State Update on Unmounted Component" Warning
**Error Type:** Massive redboxes when logging out from `ProfileScreen`.
**History:** The `signOut()` promise cleared the user payload instantly. The Redux router tore down `StudentStack` entirely. The subsequent `setLoading(false)` ran floating in limbo.
**Fix applied:** Extracted `setLoading` state handling to explicitly run BEFORE `signOut()`, relying on unmounting to garbage collect trailing references.

---

## 13. UI GUIDELINES & THEME CONSTRAINTS

When designing components, USE DHUB STANDARDS.

### 13.1 Color Palette
- **Gold Priority:** `#D4AF37` / `#c49c19`. Used exclusively for highly engaging active buttons.
- **Grey Medium:** `#7F8C8D`. Text bodies.
- **Backgrounds:** `#ffffff` and `#F8F9FA` exclusively. Dark modes are NOT fully implemented unless specifically coded inside `app.config.js`.

### 13.2 Typography & Elements
- Modals (`<Modal />`) must utilize a `transparent` black background block `rgba(0,0,0,0.5)` with padded `<KeyboardAvoidingView>` constraints to prevent mobile keyboards overlapping inputs!
- All buttons must be `<TouchableOpacity>` carrying an `activeOpacity={0.8}` or higher to feel crisp.

---

## 14. RELEASE PIPELINES & APP UPDATING

### 14.1 Production Builds
To invoke an APK/AAB or IPA pipeline:
```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

### 14.2 Environment Variables (SECRETS)
Before generating an EAS build, ensure `eas.json` holds references to Expo Secret parameters.
The local `.env` contains:
```env
EXPO_PUBLIC_SUPABASE_URL=YOUR_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_KEY
EXPO_PUBLIC_API_URL=YOUR_CUSTOM_NODE_API
```

---

## 15. FUTURE MAINTENANCE & ONBOARDING TIPS

- If an `rpc` fails loudly from Supabase, drop into the Supabase Dashboard -> **SQL Editor** -> and manually re-paste the script from `supabase_migrations.sql`.
- If a student cannot access the interactive map, make sure their `bookings` row literally possesses `status = 'confirmed'` and `payment_status = 'completed'`.
- The dummy data in `storage` buckets must have permissive RLS policies mapped to authenticated tokens! If a user cannot upload images, check the Bucket Policies in Supabase!!

---

## 16. MARKETING & EDGE FUNCTION EMAILS (RESEND)

Supabase **does not** automatically process unlimited marketing or broadcast emails natively. To trigger the emails for `new-listing`, `booking-approved`, and `weekly-marketing-email`, we utilize the **Resend API**.

### 16.1 Obtaining the Resend API Key
1. Go to [Resend.com](https://resend.com) and create a free account.
2. Under "API Keys", generate a new secret key.
3. Verify your `dhubcmr.netlify.app` domain or verify `dhubcmr@gmail.com` as your sender identity within the Resend console.
4. Bind the key to your Supabase project via the absolute CLI command:
   ```bash
   supabase secrets set RESEND_API_KEY=re_YOUR_KEY_HERE
   ```

### 16.2 Modifying the Email Templates
The HTML for the emails is strictly hardcoded inside each Edge Function file for ultimate performance without database template lookups.
If you need to change the copy, update the pun, or modify the social media footer:
1. Navigate to `supabase/functions/booking-approved-email/index.ts` (or the respective function).
2. Locate the `htmlContent` template literal.
3. Modify the standard HTML.
4. Re-deploy the function securely:
   ```bash
   supabase functions deploy booking-approved-email
   ```

### 16.3 The Automated Marketing Campaigns
We instituted two heavily automated cron sweeps:
1. **`weekly-marketing-email`**: Scans the database for listings created exclusively in the last 7 days. Broadcasts a roundup every Saturday at 9 AM.
2. **`biweekly-stats-email`**: Scans for the last 14 days, aggregating raw counts of properties injected into the ecosystem. Emailed every 1st and 15th of the month at 10 AM.
- Both scripts slice the `public.users` table for active students and utilize the `bcc` header on Resend to broadcast securely to everyone simultaneously.
- **Triggering:** You can configure this inside `supabase_migrations.sql` via `pg_cron` OR visually configure this by opening the Supabase Dashboard -> **Edge Functions** -> **Scheduled Functions**.

### 16.4 Domain Verification & Anti-Spam Protocols (CRITICAL)
**You CANNOT bulk send emails from a standard `@gmail.com` address.** 
Modern email providers enforce strict DMARC (Domain-based Message Authentication, Reporting, and Conformance) policies. If you spoof a Resend server to send an email stating it's from `dhubcmr@gmail.com`, Google's receiving servers will instantly flag it as spam or drop it completely.

**How to get Live:**
1. You **must** purchase a custom domain (e.g., `dhubcmr.com`, `dhubapp.cm`) from providers like Namecheap, GoDaddy, or Cloudflare. 
2. Go to your **Resend Dashboard** -> **Domains** -> **Add Domain**. Enter `dhubcmr.com`.
3. Resend will output a list of **DNS Records** (TXT, MX, CNAME).
4. Go to your domain registrar's DNS settings and paste those exact records.
5. In your Edge Functions, change the From header to `"Marie from DHUB <hello@dhubcmr.com>"`.

### 16.5 SPAM Prevention Best Practices
To ensure DHUB marketing emails actually land in users' Primary inboxes:
- **Never use ALL CAPS or excessive emojis** in the subject line (e.g., `FREE RENT 💰🚨🚨`).
- **Warm up the IP:** Do not blast 5,000 users on day 1. Send gradually to prevent automated rate-limit shadowbans.
- **Provide Unsubscribe Links:** Future edge function updates should include an obscure hash link allowing users to toggle a `wants_newsletter = false` flag in their `users` row.

*Final Architect Note: Do not touch the Redux Hydration logic or modify the `users` schema roles unless you are fundamentally redesigning the multi-tenant architecture of DHUB. Keep it clean, keep it strict, and keep iterating.*

---

## 17. ESCROW, DISPUTES & 2-WAY HANDSHAKES (RECENT ARCHITECTURE)

To build trust in Bamenda's rental market, DHUB acts as a strict financial mediator through Escrow.

### 17.1 The 2-Way Move-In Handshake
A tenant's money is not blindly released to the landlord. 
1. Tenant pays Rent + Caution + 5k Agent Fee. `bookings.payment_status = 'completed'`.
2. Tenant physically moves in and clicks "I Have Moved In" (`bookings.tenant_confirmation = true`).
3. Landlord clicks "Tenant Has Moved In" (`bookings.landlord_confirmation = true`).
Only when BOTH are true does the rent officially begin and funds unlock.

### 17.2 Escrow & "Loser Pays" Dispute Logic (Option B)
The Caution fee remains locked in escrow (`bookings.caution_fee`). If a tenant requests a refund and the landlord claims damages, we do not ask users for "extra" out-of-pocket cash to fund an agent visit (which causes churn).
Instead:
- The system checks `bookings.caution_fee`.
- When a dispute is filed, **5,000 FCFA is automatically deducted (frozen)** from the escrow pool and recorded in `bookings.dispute_locked_funds`.
- `bookings.dispute_initiator_id` tracks who clicked the button.
- `bookings.caution_status` becomes `'disputed'`.
- A DHUB agent physically audits the property. The loser of the audit ultimately bears the 5k fee from their share of the escrow.

### 17.3 RLS Policy Strictness
We do not use cross-table joins (`public.users`) inside RLS policies if the user doesn't inherently have `SELECT` access to the joined table. For example, `student_profiles` uses `auth.jwt() -> 'user_metadata' ->> 'role' = 'landlord'` to allow landlords to read tenant profiles without violating circular RLS restrictions.

---

## 18. ZERO-TRUST ARCHITECTURE & PROD HARDENING

DHUB operates in a high-risk environment (unstable 3G networks, cash circumvention, and informal market dynamics). We have strictly implemented a "Zero-Trust" posture across the stack.

### 18.1 Row-Level Security (RLS) Lockdown
Mobile clients can no longer perform direct `.update()` calls on structural booking state (`status`, `caution_status`, `payment_status`, etc.).
- **Strict RPCs:** All transitions must route through PostgreSQL `SECURITY DEFINER` RPCs (e.g., `set_booking_approval`, `cancel_booking`, `confirm_handshake_side`).
- **Database Enforcement:** Triggers actively block and reject any standard authenticated user attempting to patch lifecycle columns.

### 18.2 Escrow Microservice & 72-Hour Queue
Escrow logic is mathematically protected server-side via the `dhubpayment-main` microservice.
- A request enters a strict 72-hour `refund_queued` state, enforcing the exact math (97% return, 3% DHUB cut).
- Admins possess override functionality to `adminPauseEscrow` causing real-time push updates to the UI telling users to contact support.

### 18.3 Geographic Privacy (Map Masking)
To prevent tenants from poaching properties directly via external cash hand-offs:
- Coordinates (`latitude`, `longitude`) are completely truncated to 3 decimal places via the `get_masked_listings` RPC.
- This creates a ~110m obfuscation radius. Exact location coordinates are strictly locked unless `booking.status = 'confirmed'`.

### 18.4 Shadow Audit Evasion Detection
A cron-ready `run_shadow_audit` Postgres function is strictly implemented to catch bypassing.
- If a listing receives heavy attention but the landlord suddenly marks it "unavailable" right after a student cancels a booking, a high-severity `shadow_audit_logs` event fires.
- This dispatches DHUB administration to manually investigate physical evasion.

### 18.5 The Resumable Media Engine
Uploading 50MB 4K property walkthroughs natively crashes Javascript threads.
- `src/utils/upload.ts` features a robust, state-persisted, chunk-by-chunk FFmpeg pipeline.
- It operates sequentially and includes an `AbortSignal`, allowing users to explicitly "Cancel Upload", cleanly tearing down the chunk array if 3G completely drops.
