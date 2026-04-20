// src/hooks/useKeyboard.ts
import { useEffect, useState, useRef } from 'react';
import { Keyboard, Platform, KeyboardEvent } from 'react-native';

export const useKeyboard = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardWillShowRef = useRef<any>(null);
  const keyboardWillHideRef = useRef<any>(null);
  const keyboardDidShowRef = useRef<any>(null);
  const keyboardDidHideRef = useRef<any>(null);

  useEffect(() => {
    const keyboardEventListeners = [];

    if (Platform.OS === 'ios') {
      keyboardWillShowRef.current = Keyboard.addListener(
        'keyboardWillShow',
        (e: KeyboardEvent) => {
          setKeyboardHeight(e.endCoordinates.height);
          setKeyboardVisible(true);
        }
      );

      keyboardWillHideRef.current = Keyboard.addListener(
        'keyboardWillHide',
        () => {
          setKeyboardHeight(0);
          setKeyboardVisible(false);
        }
      );
    } else {
      keyboardDidShowRef.current = Keyboard.addListener(
        'keyboardDidShow',
        (e: KeyboardEvent) => {
          setKeyboardHeight(e.endCoordinates.height);
          setKeyboardVisible(true);
        }
      );

      keyboardDidHideRef.current = Keyboard.addListener(
        'keyboardDidHide',
        () => {
          setKeyboardHeight(0);
          setKeyboardVisible(false);
        }
      );
    }

    return () => {
      keyboardWillShowRef.current?.remove();
      keyboardWillHideRef.current?.remove();
      keyboardDidShowRef.current?.remove();
      keyboardDidHideRef.current?.remove();
    };
  }, []);

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return {
    keyboardHeight,
    keyboardVisible,
    dismissKeyboard,
  };
};