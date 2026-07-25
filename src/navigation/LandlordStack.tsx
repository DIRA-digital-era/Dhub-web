import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import SignIn from '../screens/auth/SignInScreen';
import LegalScreen from '../screens/common/LegalScreen';
import ApprovalScreen from '../screens/landlord/ApprovalScreen';
import BookingsScreen from '../screens/landlord/BookingsScreen';
import BoostScreen from '../screens/landlord/BoostScreen';
import EditListingScreen from '../screens/landlord/EditListingScreen';
import KYCVerificationScreen from '../screens/landlord/KYCVerificationScreen';
import ListingDetailsScreen from '../screens/landlord/ListingDetailsScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import UploadListingScreen from '../screens/landlord/UploadListingScreen';
import ReportUserScreen from '../screens/common/ReportUserScreen';
import ReportBugScreen from '../screens/common/ReportBugScreen';
import SupportScreen from '../screens/common/SupportScreen';
import { LandlordStackParamList } from '../types';
import LandlordTabNavigator from './LandlordTabNavigator';

const Stack = createNativeStackNavigator<LandlordStackParamList>();

const LandlordStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1A1A1A' },
      }}
    >
      {/* Main tabs as the initial route */}
      <Stack.Screen name="Tabs" component={LandlordTabNavigator} />

      {/* Additional screens accessible from within the tabs */}
      <Stack.Screen name="Bookings" component={BookingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="KYCVerification" component={KYCVerificationScreen} />
      <Stack.Screen name="UploadListing" component={UploadListingScreen} />
      <Stack.Screen name="EditListing" component={EditListingScreen} />
      <Stack.Screen name="BoostScreen" component={BoostScreen} />
      <Stack.Screen name="ApprovalScreen" component={ApprovalScreen} />
      <Stack.Screen name="ListingDetails" component={ListingDetailsScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="SignIn" component={SignIn} />
      <Stack.Screen name="ReportUser" component={ReportUserScreen} />
      <Stack.Screen name="ReportBug" component={ReportBugScreen} />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{ headerShown: true }}
      />
    </Stack.Navigator>
  );
};

export default LandlordStack;
