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

/**
 * Normalized review type used EVERYWHERE
 */
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
  key: string; // R2 object key
  type: MediaType;
  thumbKey?: string;
  
}
/**
 * Internal helper shape when mapping DB → UI
 */
export interface ListingMediaMapper {
  fromDB: MediaDBItem;
  toUI: MediaItem;
}


export interface MediaItem {
  url: string; // Worker URL
  type: MediaType;
  thumbUrl?: string;
  processing_status?: 'processing' | 'ready' | 'failed';
  mimeType?: string;
}


/**
 * Full listing view with joins
 */
export interface ListingDetails extends Listing {
  landlord?: Landlord | null;
  terms_text?: string | null;
  ratings: Review[]; // ✅ NOT optional anymore. Always [] at minimum.
}

/**
 * Lightweight card/home list item
 */
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
}

// what comes directly from Supabase for listings
export interface ListingRow {
  id: string;
  title: string;
  description?: string | null;
  price: number;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  media: MediaDBItem[];
  rooms?: number | null;
  avg_rating?: number | null;
  rating_count?: number | null;
  available?: boolean | null;
  boost_until?: string | null;
  created_at: string;
  updated_at?: string;
  landlord_id: string;
  landlord?: Landlord | null;
  processing_status?: 'processing' | 'ready' | 'failed';
}

// src/types.ts
export interface DashboardStatsProps {
  landlordId: string;
}


export interface ListingFilters {
  search?: string;

  city?: string;
  minPrice?: number;
  maxPrice?: number;

  rooms?: number | '5+';

  availableOnly?: boolean;

  boostedFirst?: boolean;

  limit?: number;
  offset?: number;

  // New filters
  listing_type?: 'room' | 'studio' | 'apartment' | 'house' | 'guest_house' | 'hotel';
  stay_type?: 'short_term' | 'long_term' | 'both';

  // Geo radius search
  lat?: number;
  lng?: number;
  radius_m?: number; // meters
}

// ✅ DB SHAPE (WHAT COMES FROM SUPABASE)
export interface ChatMessageDto {
  id: string;
  thread_id: string;
  sender_id: string;
  receiver_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
}
export interface ThreadDto {
  threadId: string;
  participants: User[];
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number; // ✅ add this
}

// ✅ UI SHAPE (WHAT YOUR APP USES INTERNALLY)
export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  receiverId: string | null;
  message: string;
  created_at: string;
  read?: boolean
}


export interface PaymentParams {
  amount: number;
  senderPhone: string;
  receiverPhone: string;
  description?: string;
  orderId?: string;
  userId?: string;
}
export interface ChatParticipantsRow {
  thread_id: string;
  user_id: string;
}

export interface ChatMessagesRow {
  id: string;
  thread_id: string;
  sender_id: string;
  receiver_id: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
}


export interface PaymentResult {
  transactionId: string;
  reference: string;
  status: string;
  fee: number;
  netAmount: number;
  receipt: any;
  providerResponse?: any;
}

export interface PaymentState {
  loading: boolean;
  error: string | null;
  result: PaymentResult | null;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  phone?: string;
}

export type NotificationType =
  | 'favorite_available'
  | 'booking_update'
  | 'rent_reminder'
  | 'system_announcement'
  | 'chat_message';

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

export interface Ticket {
  id: string;
  user_id: string;
  status: string;
  priority: string;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  receiver_id: string | null;
  message: string;
  created_at: string;
  read: boolean;
  sender_type: 'user' | 'admin';
  chat_type: 'support' | string;
  is_complaint: boolean;
  is_faq_candidate: boolean;
}


export interface FAQ {
  id: string;
  question: string;
  normalized_question: string;
  answer: string | null;
  usage_count: number;
  created_at: string;
}
// src/types.ts

export interface ListingFilters {
  search?: string;

  city?: string;
  minPrice?: number;
  maxPrice?: number;

  rooms?: number | '5+';

  availableOnly?: boolean;

  boostedFirst?: boolean;

  limit?: number;
  offset?: number;
}



/* ===========================
   Navigation Param Lists
=========================== */

export type StudentTabParamList = {
  Home: undefined;
  Favorites: undefined;
  Chat: { threadId?: string } | undefined; // <-- updated to threadId
  Payments: {
    listingId: string;
    bookingId: string;
    amount: number;
    description: string;
    receiverPhone: string;
    receiverName: string;
    landlordId: string;
  };
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
    | undefined;
  Profile: undefined; 
};

export type StudentStackParamList = {
  StudentTabs: NavigatorScreenParams<StudentTabParamList> | undefined;
  ListingDetails: { listingId: string };
  BookingScreen: { listingId: string; onPaymentSuccess?: () => void };
  Payments: {
    listingId: string;
    amount: number;
    description: string;
    receiverPhone: string;
    receiverName: string;
    bookingId: string;
    landlordId: string;
  };
  Support: { currentUserId: string };
  Legal: undefined;
  ViewBookingsScreen: undefined;
  BookingDetails: { bookingId: string };
  PendingScreen: { bookingId: string };
  ListingReview: { listing_id: string };
  ReportUser: undefined;
  ReportBug: undefined;
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
};


export type RootStackParamList = {
  AuthStack: NavigatorScreenParams<AuthStackParamList> | undefined;
  StudentStack: NavigatorScreenParams<StudentStackParamList> | undefined;
  LandlordStack: NavigatorScreenParams<LandlordStackParamList> | undefined;
  ListingDetails: { listingId: string } | undefined;
};

/* ===========================
   Screen & Navigation Props
=========================== */

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;
export type StudentStackScreenProps<T extends keyof StudentStackParamList> =
  NativeStackScreenProps<StudentStackParamList, T>;
export type LandlordStackScreenProps<T extends keyof LandlordStackParamList> =
  NativeStackScreenProps<LandlordStackParamList, T>;

export type StudentTabScreenProps<T extends keyof StudentTabParamList> =
  BottomTabScreenProps<StudentTabParamList, T>;
export type LandlordTabScreenProps<T extends keyof LandlordTabParamList> =
  BottomTabScreenProps<LandlordTabParamList, T>;

export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
export type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;
export type StudentStackNavigationProp =
  NativeStackNavigationProp<StudentStackParamList>;
export type LandlordStackNavigationProp =
  NativeStackNavigationProp<LandlordStackParamList>;
export type StudentTabNavigationProp = BottomTabNavigationProp<StudentTabParamList>;
export type LandlordTabNavigationProp = BottomTabNavigationProp<LandlordTabParamList>;

export type RootRouteProp<T extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, T>;
export type AuthRouteProp<T extends keyof AuthStackParamList> =
  RouteProp<AuthStackParamList, T>;
export type StudentStackRouteProp<T extends keyof StudentStackParamList> =
  RouteProp<StudentStackParamList, T>;
export type LandlordStackRouteProp<T extends keyof LandlordStackParamList> =
  RouteProp<LandlordStackParamList, T>;
export type StudentTabRouteProp<T extends keyof StudentTabParamList> =
  RouteProp<StudentTabParamList, T>;
export type LandlordTabRouteProp<T extends keyof LandlordTabParamList> =
  RouteProp<LandlordTabParamList, T>;
