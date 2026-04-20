//src/store/listings.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Listing } from '../types';

interface ListingsState {
  listings: Listing[];
}

const initialState: ListingsState = {
  listings: [],
};

export const listingsSlice = createSlice({
  name: 'listings',
  initialState,
  reducers: {
    setListings: (state, action: PayloadAction<Listing[]>) => {
      state.listings = action.payload;
    },
    addListing: (state, action: PayloadAction<Listing>) => {
      state.listings.push(action.payload);
    },
    removeListing: (state, action: PayloadAction<string>) => {
      state.listings = state.listings.filter(l => l.id !== action.payload);
    },
  },
});

// **Export the actions**
export const { setListings, addListing, removeListing } = listingsSlice.actions;

// **Export the reducer** — THIS IS KEY for TS2306
export default listingsSlice.reducer;
