// src/navigation/RootNavigator.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { RootState } from '../store/store';

// Stacks
import AuthStack from './AuthStack';
import LandlordStack from './LandlordStack';
import StudentStack from './StudentStack';

// Password Update Screen
import UpdatePasswordScreen from '../screens/auth/UpdatePasswordScreen';

// Common screens
import ListingDetailsScreen from '../screens/student/ListingDetailsScreen';

// Types
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  const userRole = useSelector((state: RootState) => state.auth.user?.role);
  const loading = useSelector((state: RootState) => state.auth.isLoading);
  const requiresPasswordUpdate = useSelector((state: RootState) => state.auth.requiresPasswordUpdate);
  const { colors } = useTheme();

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.tint} />
      </SafeAreaView>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {requiresPasswordUpdate ? (
        <Stack.Screen name="UpdatePassword" component={UpdatePasswordScreen} />
      ) : userRole ? (
        userRole === 'landlord' ? (
          <Stack.Screen name="LandlordStack" component={LandlordStack} />
        ) : (
          <Stack.Screen name="StudentStack" component={StudentStack} />
        )
      ) : (
        <Stack.Screen name="AuthStack" component={AuthStack} />
      )}

      {/* Common screens accessible from anywhere */}
      <Stack.Screen name="ListingDetails" component={ListingDetailsScreen} />
    </Stack.Navigator>
  );
};

export default RootNavigator;