// src/screens/student/PaymentScreen.tsx
import { useNavigation, useRoute } from "@react-navigation/native";
import React from "react";
import {
  Platform
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import type { RootState } from "../../store/store";

// Import the download screen
import DownloadAppScreen from '../common/DownloadAppScreen';

import { useTranslation } from "react-i18next";

// ... rest of imports and constants ...

const PaymentScreen: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute();
  const incoming = route.params as any;
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const { initiating, initiateError, fetchingHistory, fetchError } = useAppSelector(
    (state: RootState) => state.payments
  );
  const history = useAppSelector((state: RootState) => state.payments.history);
  const { colors: themeColors, isDark } = useTheme();

  // ============================================================
  // WEB: Show download screen instead of payment UI
  // ============================================================
  if (Platform.OS === 'web') {
    return <DownloadAppScreen onClose={() => navigation.goBack()} />;
  }

  // ... rest of component (unchanged)
};

// ... styles etc. (unchanged)

export default PaymentScreen;