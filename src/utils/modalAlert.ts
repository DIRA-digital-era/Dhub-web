// src/utils/modalAlert.ts
// Imperative API to show the ConfirmModal from anywhere without prop-drilling.
// Usage: import { modalAlert } from '../utils/modalAlert';
//        modalAlert.show({ title: 'Hello', message: 'World', buttons: [...] });
//
// Mount <GlobalModalAlert /> once near the top of your app (e.g. in App.tsx).

import React, { useEffect, useState } from 'react';
import ConfirmModal, { ConfirmModalButton } from '../components/ConfirmModal';
import { Ionicons } from '@expo/vector-icons';

export interface ModalAlertOptions {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  buttons?: ConfirmModalButton[];
}

type Listener = (opts: ModalAlertOptions | null) => void;

class ModalAlertManager {
  private listeners: Listener[] = [];

  show(opts: ModalAlertOptions) {
    this.listeners.forEach(l => l(opts));
  }

  dismiss() {
    this.listeners.forEach(l => l(null));
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

export const modalAlert = new ModalAlertManager();

/** Mount this once at the root of your app */
export const GlobalModalAlert: React.FC = () => {
  const [opts, setOpts] = useState<ModalAlertOptions | null>(null);

  useEffect(() => {
    const unsub = modalAlert.subscribe(setOpts);
    return unsub;
  }, []);

  return React.createElement(ConfirmModal, {
    visible: opts !== null,
    title: opts?.title ?? '',
    message: opts?.message,
    icon: opts?.icon,
    iconColor: opts?.iconColor,
    buttons: opts?.buttons ?? [{ text: 'OK', onPress: () => modalAlert.dismiss() }],
    onDismiss: () => setOpts(null),
  });
};
