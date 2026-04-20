// src/navigation/RootNavigator.tsx
import React from 'react';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';

// Stacks
import AuthStack from './AuthStack';
import StudentStack from './StudentStack';
import LandlordStack from './LandlordStack';

// Common screens
import ListingDetailsScreen from '../screens/student/ListingDetailsScreen';

// Types
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  // Redux-driven
  const userRole = useSelector((state: RootState) => state.auth.user?.role);
  const loading = useSelector((state: RootState) => state.auth.isLoading);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#B8860B" />
      </SafeAreaView>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {userRole ? (
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
