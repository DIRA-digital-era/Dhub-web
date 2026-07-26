// src/types.ts
import { BottomTabNavigationProp, BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

/* ===========================
   Domain / Model Types 
=========================== */

export type Role = 'student' | 'landlord' | 'mover' | 'admin';

export interface Listing {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  city: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  terms_marker?: string | null;
  media: MediaItem[];
  rooms?: number | null;
  avg_rating?: number | null;
  rating_count?: number | null;
  available?: boolean | null;
  boost_until?: string | null;
  created_at: string;
  updated_at?: string;
  landlord_id: string;
  processing_status?: 'processing' | 'ready' | 'failed';
  is_verified?: boolean | null;
  verification_expires_at?: string | null;
  cite_id?: string | null;
  listing_type?: 'room' | 'studio' | 'apartment' | 'house' | 'guest_house' | 'hotel' | null;
  stay_type?: 'short_term' | 'long_term' | 'both' | null;
  price_unit?: 'per_month' | 'per_night' | null;
}

export interface Landlord {
  id: string;
  full_name: string;
  email: string;
   momo?: string | null;
  phone?: string | null;
  profile_pic?: string | null;
  created_at: string;
}

export interface Cite {
  id: string;
  landlord_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Booking {
  id: string;
  listing_id: string;
  student_id: string;
  landlord_id: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  payment_status: 'pending' | 'completed' | 'failed';
  amount: number;
  total_amount?: number | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at?: string;
  agreed_to_terms?: boolean;
  contract_status?: 'draft' | 'signed' | 'enforced' | 'expired' | 'cancelled';
  agreement_id?: string | null;
  agreement_hash?: string | null;
  signature_method?: string | null;
  signature_text?: string | null;
  signed_at?: string | null;
  agreement_device_info?: Record<string, any> | null;
  terms_version?: string | null;
  approval_status?: string;
  duration_type?: string;
  caution_fee?: number;
  caution_status?: 'held' | 'refunded' | 'disputed' | 'claimed';
  entry_media?: MediaItem[];
  exit_media?: MediaItem[];
}

export interface Review {
  id: string;
  score: number;
  comment?: string | null;
  created_at: string;
  reviewer: {
    id: string;
    full_name: string;
    profile_pic?: string | null;
  };
}

export type MediaType = 'image' | 'video';

export interface MediaDBItem {
  key: string;
  type: MediaType;
  thumbKey?: string;
}

export interface MediaItem {
  url: string;
  type: MediaType;
  thumbUrl?: string;
  processing_status?: 'processing' | 'ready' | 'failed';
  mimeType?: string;
}

export interface ListingDetails extends Listing {
  landlord?: Landlord | null;
  terms_text?: string | null;
  ratings: Review[];
}

export interface ListingSummary {
  id: string;
  title: string;
  price: number;
  city: string;
  rooms: number | null;
  landlord_id: string;
  image_url: string;
  avg_rating: number | null;
  rating_count: number | null;
  available?: boolean | null;
  boosted?: boolean;
  created_at: string;
  listing_type: 'room' | 'studio' | 'apartment' | 'house' | 'guest_house' | 'hotel';
  stay_type: 'short_term' | 'long_term' | 'both';
  price_unit: 'per_night' | 'per_week' | 'per_month' | 'per_stay';
  processing_status?: 'processing' | 'ready' | 'failed';
  is_verified?: boolean | null;
  description?: string | null;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  recipient_role: Role;
  title: string;
  body: string;
  type: NotificationType;
  listing_id?: string | null;
  booking_id?: string | null;
  data?: Record<string, any> | null;
  is_read: boolean;
  push_sent: boolean;
  push_sent_at?: string | null;
  created_at: string;
}

export type NotificationType =
  | 'favorite_available'
  | 'booking_update'
  | 'rent_reminder'
  | 'system_announcement'
  | 'chat_message';

// Support types (used by SupportScreen & supportService)
export interface Ticket {
  id: string;
  user_id: string;
  status: 'open' | 'closed' | 'pending';
  priority: 'low' | 'normal' | 'high';
  created_at: string;
  updated_at?: string;
}

export interface Chat {
  id: string;
  ticket_id: string;
  sender_id: string;
  receiver_id?: string | null;
  message: string;
  read: boolean;
  sender_type: 'user' | 'bot' | 'agent';
  chat_type?: string;
  is_complaint?: boolean;
  is_faq_candidate?: boolean;
  created_at: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer?: string | null;
  created_at?: string;
}

export interface ListingFilters {
  search?: string;
  city?: string;
  rooms?: number | '5+';
  minPrice?: number;
  maxPrice?: number;
  availableOnly?: boolean;
  boostedFirst?: boolean;
  limit?: number;
  offset?: number;
  listing_type?: string;
  stay_type?: string;
  lat?: number;
  lng?: number;
  radius_m?: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  receiverId: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

export interface ChatMessageDto {
  id: string;
  thread_id: string;
  sender_id: string;
  receiver_id?: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface ThreadDto {
  threadId: string;
  participants: User[];
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  phone?: string;
  momo?: string;
}

/* ===========================
   Navigation Param Lists
=========================== */

export type StudentTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Chat: { threadId?: string } | undefined;
  Bookings: undefined;
  Profile: undefined;
};

export type LandlordTabParamList = {
  Dashboard: undefined;
  ManageListings: undefined;
  Chat: { threadId?: string } | undefined;
  Payments:
    | {
        listingId: string;
        planId: string;
        durationDays: number;
        price: number;
        purpose: string;
      }
    | {
        listingId: string;
        amount: number;
        description: string;
        reason: 'verification';
      }
    | undefined;
  Profile: undefined; 
};

export type StudentStackParamList = {
  StudentTabs: NavigatorScreenParams<StudentTabParamList> | undefined;
  ListingDetails: { listingId: string };
  BookingScreen: { listingId: string };
  Payments: {
    listingId: string;
    listingType?: string;
    amount: number;
    description: string;
    receiverPhone: string;
    receiverName: string;
    bookingId?: string;
    landlordId?: string;
    paymentType?: 'initial' | 'rent_completion' | 'renewal';
    isRenewal?: boolean;
    reason?: 'rent' | 'boosting' | 'landlord_subscription';
  };
  Support: { currentUserId: string };
  Legal: undefined;
  ViewBookingsScreen: undefined;
  BookingDetails: { bookingId: string };
  PendingScreen: { bookingId: string };
  ListingReview: { listing_id: string };
  ReportUser: undefined;
  ReportBug: undefined;
  Notifications: undefined;
};

export type LandlordStackParamList = {
  Tabs: NavigatorScreenParams<LandlordTabParamList> | undefined;
  Bookings: undefined;
  Notifications: undefined;
  KYCVerification: undefined;
  UploadListing: undefined;
  EditListing: { listingId: string };
  ListingDetails: { listingId: string };
  BoostScreen: { listingId: string };
  ApprovalScreen: { bookingId: string };
  Legal: undefined;
  SignIn: undefined;
  ReportUser: undefined;
  ReportBug: undefined;
  Support: { currentUserId: string };
};

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  VerifyOtp: {
    whatsappNumber: string;
    mode: 'signup' | 'login' | 'reset';
    fullName?: string;
    password?: string;
    role?: 'student' | 'landlord';
    email?: string;
    mobileMoney?: string;
    age?: string;
    address?: string;
    language?: 'en' | 'fr' | 'pcm';
  };
  ForgotPassword: { email?: string; phone?: string };
  ResetPassword: { phone: string; mode: 'reset' };
  EmailVerification: { email: string; mode: 'signup' | 'recovery' };
  AuthCallback: undefined; // new
};

export type RootStackParamList = {
  AuthStack: NavigatorScreenParams<AuthStackParamList> | undefined;
  StudentStack: NavigatorScreenParams<StudentStackParamList> | undefined;
  LandlordStack: NavigatorScreenParams<LandlordStackParamList> | undefined;
  ListingDetails: { listingId: string } | undefined;
  UpdatePassword: undefined;
};

/* ===========================
   Screen & Navigation Props
=========================== */

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
export type AuthStackScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;
export type StudentStackScreenProps<T extends keyof StudentStackParamList> = NativeStackScreenProps<StudentStackParamList, T>;
export type LandlordStackScreenProps<T extends keyof LandlordStackParamList> = NativeStackScreenProps<LandlordStackParamList, T>;
export type StudentTabScreenProps<T extends keyof StudentTabParamList> = BottomTabScreenProps<StudentTabParamList, T>;
export type LandlordTabScreenProps<T extends keyof LandlordTabParamList> = BottomTabScreenProps<LandlordTabParamList, T>;

export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
export type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;
export type StudentStackNavigationProp = NativeStackNavigationProp<StudentStackParamList>;
export type LandlordStackNavigationProp = NativeStackNavigationProp<LandlordStackParamList>;
export type StudentTabNavigationProp = BottomTabNavigationProp<StudentTabParamList>;
export type LandlordTabNavigationProp = BottomTabNavigationProp<LandlordTabParamList>;

export type RootRouteProp<T extends keyof RootStackParamList> = RouteProp<RootStackParamList, T>;
export type AuthRouteProp<T extends keyof AuthStackParamList> = RouteProp<AuthStackParamList, T>;
export type StudentStackRouteProp<T extends keyof StudentStackParamList> = RouteProp<StudentStackParamList, T>;
export type LandlordStackRouteProp<T extends keyof LandlordStackParamList> = RouteProp<LandlordStackParamList, T>;
export type StudentTabRouteProp<T extends keyof StudentTabParamList> = RouteProp<StudentTabParamList, T>;
export type LandlordTabRouteProp<T extends keyof LandlordTabParamList> = RouteProp<LandlordTabParamList, T>;
