// src/navigation/LandlordTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/landlord/DashboardScreen';
import ManageListings from '../screens/landlord/ManageListings';
import ChatWrapper from '../screens/common/ChatWrapper'; // <-- use wrapper
import PaymentsScreen from '../screens/landlord/PaymentScreen';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { fetchTotalUnreadCount } from '../services/chatService';
import ProfileScreen from '../screens/landlord/ProfileScreen';
import {LandlordTabParamList}from '../types';


const Tab = createBottomTabNavigator<LandlordTabParamList>();

const LandlordTabNavigator: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    const loadUnread = async () => {
      const count = await fetchTotalUnreadCount(currentUser.id);
      setUnreadCount(count);
    };
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  useFocusEffect(
    React.useCallback(() => {
      if (!currentUser?.id) return;
      fetchTotalUnreadCount(currentUser.id).then(setUnreadCount);
    }, [currentUser?.id])
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName: string;
          switch (route.name) {
            case 'Dashboard':
              iconName = 'speedometer';
              break;
            case 'ManageListings':
              iconName = 'list';
              break;
            case 'Chat':
              iconName = 'chatbubble';
              break;
            case 'Payments':
              iconName = 'card';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'ellipse';
          }
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="ManageListings" component={ManageListings} />
      <Tab.Screen 
        name="Chat" 
        component={ChatWrapper} 
        initialParams={undefined} // ensures params are optional
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="Payments" component={PaymentsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />

    </Tab.Navigator>
  );
};

export default LandlordTabNavigator;
