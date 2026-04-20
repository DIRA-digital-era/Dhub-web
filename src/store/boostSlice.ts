import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface BoostData {
  listingId: string;
  planId: string;
  durationDays: number;
  price: number;
  purpose: 'boost';
}

interface BoostState {
  currentBoost: BoostData | null;
}

const initialState: BoostState = {
  currentBoost: null,
};

const boostSlice = createSlice({
  name: 'boost',
  initialState,
  reducers: {
    setBoost: (state, action: PayloadAction<BoostData>) => {
      state.currentBoost = action.payload;
    },
    clearBoost: (state) => {
      state.currentBoost = null;
    },
  },
});

export const { setBoost, clearBoost } = boostSlice.actions;
export default boostSlice.reducer;
