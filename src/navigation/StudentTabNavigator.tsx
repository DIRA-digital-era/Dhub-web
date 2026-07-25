// src/navigation/StudentTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/student/HomeScreen';
import FavoritesScreen from '../screens/student/FavoritesScreen';
import ChatWrapper from '../screens/common/ChatWrapper';
import ViewBookingsScreen from '../screens/student/ViewBookingsScreen';
import ProfileScreen from '../screens/student/ProfileScreen';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import { fetchTotalUnreadCount } from '../services/chatService';

export type StudentTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Chat: { otherUserId?: string } | undefined;
  Bookings: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<StudentTabParamList>();

const StudentTabNavigator: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    const loadUnread = async () => {
      const count = await fetchTotalUnreadCount(currentUser.id);
      setUnreadCount(count);
    };
    loadUnread();
    const interval = setInterval(loadUnread, 15000); // poll every 15s
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
            case 'Home':
              iconName = 'home';
              break;
            case 'Favorites':
              iconName = 'heart';
              break;
            case 'Chat':
              iconName = 'chatbubble';
              break;
            case 'Bookings':
              iconName = 'calendar';
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
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen 
        name="Chat" 
        component={ChatWrapper}
        initialParams={undefined}
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="Bookings" component={ViewBookingsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export default StudentTabNavigator;
