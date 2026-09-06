// src/utils/alert.ts
// Unified alert helper. On native it uses Alert.alert, on web it uses our
// premium in-app ConfirmModal via modalAlert (no more ugly browser popups).
import { Alert, AlertButton, AlertOptions, Platform } from 'react-native';
import { modalAlert } from './modalAlert';

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  _options?: AlertOptions
) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, _options);
    return;
  }

  // Web — use our in-app modal
  if (!buttons || buttons.length === 0) {
    modalAlert.show({
      title,
      message,
      buttons: [{ text: 'OK', onPress: () => modalAlert.dismiss() }],
    });
    return;
  }

  modalAlert.show({
    title,
    message,
    buttons: buttons.map(btn => ({
      text: btn.text ?? 'OK',
      style: btn.style as any,
      onPress: () => {
        modalAlert.dismiss();
        btn.onPress?.();
      },
    })),
  });
}
