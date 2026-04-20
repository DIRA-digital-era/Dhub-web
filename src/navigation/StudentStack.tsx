// src/navigation/StudentStack.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StudentTabNavigator from './StudentTabNavigator';
import ListingDetailsScreen from '../screens/student/ListingDetailsScreen';
import BookingScreen from '../screens/student/BookingScreen';
import SupportScreen from '../screens/common/SupportScreen';
import LegalScreen from '../screens/common/LegalScreen';
import ViewBookingsScreen from '../screens/student/ViewBookingsScreen';
import BookingDetails from '../screens/student/BookingDetails';
import PendingScreen from '../screens/student/PendingScreen';
import ListingReviewScreen from "../screens/student/ListingReviewScreen";
import ReportUserScreen from '../screens/common/ReportUserScreen';
import ReportBugScreen from '../screens/common/ReportBugScreen';
import { StudentStackParamList } from '../types';


const Stack = createNativeStackNavigator<StudentStackParamList>();

const StudentStack: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StudentTabs" component={StudentTabNavigator} />
      <Stack.Screen name="ListingDetails" component={ListingDetailsScreen} />
      <Stack.Screen name="BookingScreen" component={BookingScreen} />
      <Stack.Screen 
        name="Support" 
        component={SupportScreen} 
        options={{ headerShown: true }} // only show header for Support
      />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="ViewBookingsScreen" component={ViewBookingsScreen} />
      <Stack.Screen name="BookingDetails" component={BookingDetails} />
      <Stack.Screen name="PendingScreen" component={PendingScreen} />
      <Stack.Screen name="ListingReview"  component={ListingReviewScreen}/>
      <Stack.Screen name="ReportUser" component={ReportUserScreen} />
      <Stack.Screen name="ReportBug" component={ReportBugScreen} />
    </Stack.Navigator>
  );
};

export default StudentStack;
