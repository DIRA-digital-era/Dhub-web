import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { supabase } from '../utils/supabaseClient';

export interface Payment {
  id: string;
  transactionId: string;
  amount: number;
  sender: string;
  receiver: string;
  status: 'pending' | 'completed' | 'failed';
  date: string;
  description: string;
  fee?: number;
  netAmount?: number;
}

// ---------- Async Thunk ----------

export interface InitiateTransferArgs {
  payerPhone: string;
  receiverPhone: string;
  amount: string;
  reason: string;
  transferType: string;
  client: {
    name: string;
    description: string;
    payer_id: string;
    payee_id: string;
    listing_id: string;
    booking_id: string;
    idempotency_key: string;
  };
}

export interface InitiateCollectionArgs {
  payerPhone: string;
  amount: string;
  reason: string;
  client: {
    name: string;
    id: string;
    payer_id: string;
    listing_id: string;
    idempotency_key: string;
  };
}

const API_BASE_URL = process.env.DIRA_PAYMENT_URL || 'https://dhubpayment.onrender.com';
export const initiateTransfer = createAsyncThunk<
  any,
  InitiateTransferArgs,
  { rejectValue: string }
>(
  'payments/initiateTransfer',
  async (args, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/payments/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return rejectWithValue(errorBody?.message ?? `Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Network error. Please check your connection.');
    }
  }
);

export const initiateCollection = createAsyncThunk<
  any,
  InitiateCollectionArgs,
  { rejectValue: string }
>(
  'payments/initiateCollection',
  async (args, { rejectWithValue }) => {
    console.log(API_BASE_URL)
    try {
      const response = await fetch(`${API_BASE_URL}/api/payments/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return rejectWithValue(errorBody?.message ?? `Request failed with status ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Network error. Please check your connection.');
    }
  }
);

export const fetchPayments = createAsyncThunk<
  Payment[],
  string, // userId
  { rejectValue: string }
>(
  'payments/fetch',
  async (userId, { rejectWithValue }) => {
    try {
      // console.log('🔵 [fetchPayments] Fetching...');
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('payer_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('🔴 [fetchPayments] Supabase error:', error);
        throw error;
      }

      // console.log('🟢 [fetchPayments] Success');

      return (data || []).map((row: any) => ({
        id: row.id,
        transactionId: row.transaction_ref || row.id,
        amount: parseFloat(row.amount),
        sender: row.payer_id,
        receiver: row.payee_id,
        status: row.status as any,
        date: row.created_at,
        description: row.currency ? `${row.currency} Payment` : 'Payment',
        // fee/netAmount are optional as they were not in the provided schema
      }));
    } catch (err: any) {
      return rejectWithValue(err.message || 'Failed to fetch payments');
    }
  }
);

// ---------- State ----------

interface PaymentsState {
  history: Payment[];
  initiating: boolean;
  initiateError: string | null;
  initiateData: any | null;
  fetchingHistory: boolean;
  fetchError: string | null;
}

const initialState: PaymentsState = {
  history: [],
  initiating: false,
  initiateError: null,
  initiateData: null,
  fetchingHistory: false,
  fetchError: null,
};

// ---------- Slice ----------

const paymentsSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    addPayment: (state, action: PayloadAction<Payment>) => {
      state.history.unshift(action.payload); // latest first
    },
    setPayments: (state, action: PayloadAction<Payment[]>) => {
      state.history = action.payload;
    },
    clearInitiateState: (state) => {
      state.initiating = false;
      state.initiateError = null;
      state.initiateData = null;
    },
    upsertPayment: (state, action: PayloadAction<Payment>) => {
      const index = state.history.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.history[index] = action.payload;
      } else {
        state.history.unshift(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initiateTransfer.pending, (state) => {
        state.initiating = true;
        state.initiateError = null;
        state.initiateData = null;
      })
      .addCase(initiateTransfer.fulfilled, (state, action) => {
        state.initiating = false;
        state.initiateData = action.payload;
      })
      .addCase(initiateTransfer.rejected, (state, action) => {
        state.initiating = false;
        state.initiateError = action.payload ?? 'Payment failed. Please try again.';
      })
      .addCase(initiateCollection.pending, (state) => {
        state.initiating = true;
        state.initiateError = null;
        state.initiateData = null;
      })
      .addCase(initiateCollection.fulfilled, (state, action) => {
        state.initiating = false;
        state.initiateData = action.payload;
      })
      .addCase(initiateCollection.rejected, (state, action) => {
        state.initiating = false;
        state.initiateError = action.payload ?? 'Payment failed. Please try again.';
      })
      // fetchPayments
      .addCase(fetchPayments.pending, (state) => {
        state.fetchingHistory = true;
        state.fetchError = null;
      })
      .addCase(fetchPayments.fulfilled, (state, action) => {
        state.fetchingHistory = false;
        state.history = action.payload;
      })
      .addCase(fetchPayments.rejected, (state, action) => {
        state.fetchingHistory = false;
        state.fetchError = action.payload ?? 'Failed to fetch payments';
      });
  },
});

export const { addPayment, setPayments, clearInitiateState, upsertPayment } = paymentsSlice.actions;
export default paymentsSlice.reducer;
