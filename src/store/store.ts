//src/store/store.ts
import { configureStore, combineReducers, Action, Reducer } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import listingsReducer from './listingsSlice';
import chatReducer from './chatSlice';
import paymentsReducer from './paymentsSlice';

const appReducer = combineReducers({
  auth: authReducer,
  listings: listingsReducer,
  chat: chatReducer,
  payments: paymentsReducer,
});

const rootReducer: Reducer = (state: ReturnType<typeof appReducer> | undefined, action: Action) => {
  if (action.type === 'auth/logout/fulfilled') {
    // Return undefined to trigger all reducers to reset to default state
    state = undefined;
  }
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
