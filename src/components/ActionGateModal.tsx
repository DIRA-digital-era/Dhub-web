import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export type ActionGateModalProps = {
  visible: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  primaryButtonText: string;
  onPrimaryPress: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  onClose: () => void;
};

const ActionGateModal: React.FC<ActionGateModalProps> = ({
  visible,
  iconName,
  title,
  message,
  primaryButtonText,
  onPrimaryPress,
  secondaryButtonText,
  onSecondaryPress,
  onClose,
}) => {
  const { colors: themeColors, isDark } = useTheme();

  const colors = useMemo(() => ({
    overlay: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
    background: themeColors.card,
    text: themeColors.text,
    textSecondary: themeColors.textSecondary,
    border: themeColors.border,
    primary: themeColors.primary,
    gold: '#D4AF37', // Dhub signature gold
    goldLight: 'rgba(212, 175, 55, 0.1)',
  }), [themeColors, isDark]);

  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.background,
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
        },
        android: {
          elevation: 10,
        },
        web: {
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        }
      })
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.goldLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    buttonsContainer: {
      width: '100%',
      gap: 12,
    },
    primaryBtn: {
      backgroundColor: colors.gold,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      width: '100%',
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryBtn: {
      backgroundColor: 'transparent',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: '600',
    },
  }), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.iconContainer}>
            <Ionicons name={iconName} size={32} color={colors.gold} />
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          
          <View style={styles.buttonsContainer}>
            <TouchableOpacity 
              style={styles.primaryBtn} 
              onPress={onPrimaryPress}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>{primaryButtonText}</Text>
            </TouchableOpacity>

            {secondaryButtonText && (
              <TouchableOpacity 
                style={styles.secondaryBtn} 
                onPress={onSecondaryPress || onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>{secondaryButtonText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ActionGateModal;
