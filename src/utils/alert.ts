import { Alert, Platform, AlertButton, AlertOptions } from 'react-native';

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  // Web: no buttons = simple alert
  if (!buttons || buttons.length === 0) {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }

  // Web can reliably model the common 2-button confirmation case.
  if (buttons.length === 2) {
    const cancelButton =
      buttons.find(button => button.style === 'cancel') ?? buttons[0];

    const confirmButton =
      buttons.find(button => button !== cancelButton) ?? buttons[1];

    const confirmed = window.confirm(
      message ? `${title}\n\n${message}` : title,
    );

    if (confirmed) {
      confirmButton.onPress?.();
    } else {
      cancelButton.onPress?.();
    }

    return;
  }

  // For 1-button or >2-button alerts, use a normal alert
  // and invoke the appropriate/default action.
  window.alert(message ? `${title}\n\n${message}` : title);

  const defaultButton =
    buttons.find(button => button.style !== 'cancel') ?? buttons[0];

  defaultButton?.onPress?.();
}
