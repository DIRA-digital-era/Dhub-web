// src/store/paymentSlice.ts
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  InitiateBookingPaymentArgs,
  InitiateCollectionArgs,
  InitiateTransferArgs,
  InitiateVerificationPaymentArgs,
  Payment,
  paymentService
} from '../services/paymentService';

// ---------- Async Thunks ----------

export const initiateBookingPayment = createAsyncThunk<
  any,
  InitiateBookingPaymentArgs,
  { rejectValue: string }
>(
  'payments/initiateBookingPayment',
  async (args, { rejectWithValue }) => {
    try {
      return await paymentService.initiateBookingPayment(args);
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Network error. Please check your connection.');
    }
  }
);

export const initiateVerificationPayment = createAsyncThunk<
  any,
  InitiateVerificationPaymentArgs,
  { rejectValue: string }
>(
  'payments/initiateVerificationPayment',
  async (args, { rejectWithValue }) => {
    try {
      return await paymentService.initiateVerificationPayment(args);
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Network error. Please check your connection.');
    }
  }
);

export const initiateTransfer = createAsyncThunk<
  any,
  InitiateTransferArgs,
  { rejectValue: string }
>(
  'payments/initiateTransfer',
  async (args, { rejectWithValue }) => {
    try {
      return await paymentService.initiateTransfer(args);
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
    try {
      return await paymentService.initiateCollection(args);
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
      return await paymentService.fetchPayments(userId);
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
      .addCase(initiateBookingPayment.pending, (state) => {
        state.initiating = true;
        state.initiateError = null;
        state.initiateData = null;
      })
      .addCase(initiateBookingPayment.fulfilled, (state, action) => {
        state.initiating = false;
        state.initiateData = action.payload;
      })
      .addCase(initiateBookingPayment.rejected, (state, action) => {
        state.initiating = false;
        state.initiateError = action.payload ?? 'Unable to start payment.';
      })
      .addCase(initiateVerificationPayment.pending, (state) => {
        state.initiating = true;
        state.initiateError = null;
        state.initiateData = null;
      })
      .addCase(initiateVerificationPayment.fulfilled, (state, action) => {
        state.initiating = false;
        state.initiateData = action.payload;
      })
      .addCase(initiateVerificationPayment.rejected, (state, action) => {
        state.initiating = false;
        state.initiateError = action.payload ?? 'Verification payment failed. Please try again.';
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