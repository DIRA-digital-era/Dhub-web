# Dhub - Digital Housing Hub 🏠📱

Dhub is a premium mobile marketplace designed to bridge the gap between students and landlords in Cameroon. It provides a seamless, secure, and intuitive experience for discovering, booking, and managing student accommodations.

---

## 🚀 Technology Stack

- **Framework**: [React Native](https://reactnative.dev/) with [Expo](https://expo.dev/)
- **State Management**: [Redux Toolkit](https://redux-toolkit.js.org/)
- **Backend / Database**: [Supabase](https://supabase.com/) (PostgreSQL + Real-time)
- **Authentication**: Google OAuth 2.0 (PKCE) & Phone/Password
- **Payments**: Mobile Money (MoMo) Integration via Custom API
- **Styling**: Vanilla React Native StyleSheet with a Premium Gold & Dark Theme
- **Deep Linking**: Expo Linking for OAuth and cross-app navigation

---

## ✨ Key Features

### 🎓 For Students
- **Smart Discovery**: Search and filter listings by city, price, and room count.
- **Geo-Location**: View properties on a map (unlocked after payment).
- **Secure Payments**: Pay for bookings directly via Mobile Money with automated receipt generation.
- **Real-time Chat**: Direct communication line with landlords.
- **Favorites**: Save your top picks for quick access later.

### 🏠 For Landlords
- **Listing Management**: Upload and edit property details, including high-quality images and video tours.
- **KYC Verification**: Secure identity verification to build trust.
- **Booking Dashboard**: Manage incoming tenant requests and payment statuses.
- **Boosted Listings**: Premium visibility for top-tier properties.

---

## 🛠️ Project Structure

```text
src/
├── components/     # Reusable UI components (Buttons, Modals, Notifications)
├── hooks/          # Custom React hooks (useAuth, useVersionCheck)
├── screens/        # Screen-level components categorized by role
│   ├── auth/       # Login, SignUp, OTP Verification
│   ├── student/    # Booking, Payments, Home, ListingDetails
│   ├── landlord/   # DASHBOARD, UploadListing, Profile
│   └── common/     # Chat, Support, Error states
├── store/          # Redux slices and store configuration
├── types/          # TypeScript interfaces and navigation param lists
└── utils/          # API clients (Supabase), Auth helpers, and Constants
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory with the following keys:

- `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon Key
- `EXPO_PUBLIC_API_URL`: Backend API for authentication
- `DIRA_PAYMENT_URL`: Payment gateway endpoint

---

## 🏗️ Building for Production (Android)

Dhub is configured for automated cloud builds via **EAS (Expo Application Services)**.

1. **Configure EAS**:
   ```bash
   npx eas-cli build:configure
   ```

2. **Trigger Android Build**:
   ```bash
   npx eas-cli build -p android --profile preview
   ```

3. **Package Name**: `com.dira.dhub`

---

## 🛡️ Security & Privacy

- **Data Redaction**: The codebase is audited for production to ensure no sensitive tokens or user data are logged to the console.
- **OAuth Handshake**: Secure Google PKCE flow managed via Supabase.
- **Role-Based Access**: Strict enforcement of student vs. landlord capabilities.

---

*Built with ❤️ by Digital Era Team.*
