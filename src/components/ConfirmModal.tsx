// src/components/ConfirmModal.tsx
// A premium in-app modal to replace native window.alert / window.confirm on web.
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export interface ConfirmModalButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  buttons?: ConfirmModalButton[];
  onDismiss?: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  message,
  icon,
  iconColor,
  buttons = [{ text: 'OK' }],
  onDismiss,
}) => {
  const { isDark } = useTheme();
  const bg = isDark ? '#1A1A1A' : '#FFFFFF';
  const overlay = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';
  const titleColor = isDark ? '#FFFFFF' : '#111111';
  const msgColor = isDark ? '#AAAAAA' : '#555555';
  const borderColor = isDark ? '#2A2A2A' : '#EFEFEF';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: overlay }]}>
        <View style={[styles.card, { backgroundColor: bg, borderColor }]}>
          {icon && (
            <View style={[styles.iconWrap, { backgroundColor: (iconColor ?? '#D4AF37') + '20' }]}>
              <Ionicons name={icon} size={32} color={iconColor ?? '#D4AF37'} />
            </View>
          )}

          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: msgColor }]}>{message}</Text>
          ) : null}

          <View style={[styles.buttonRow, { borderTopColor: borderColor }]}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const btnBg = isDestructive
                ? '#E53935'
                : isCancel
                ? (isDark ? '#2A2A2A' : '#F5F5F5')
                : '#D4AF37';
              const btnText = isDestructive || (!isCancel)
                ? '#FFFFFF'
                : (isDark ? '#CCCCCC' : '#333333');

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.button,
                    { backgroundColor: btnBg },
                    buttons.length === 1 && styles.buttonFull,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    onDismiss?.();
                    btn.onPress?.();
                  }}
                >
                  <Text style={[styles.buttonText, { color: btnText }]}>{btn.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: Math.min(width - 48, 400),
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 28,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    gap: 0,
    padding: 12,
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ConfirmModal;
