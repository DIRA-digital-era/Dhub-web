import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LanguageSelector: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  const languages = [
    { code: 'eng', label: 'EN' },
    { code: 'fren', label: 'FR' },
    { code: 'pidgin', label: 'PCM' },
  ];

  const changeLanguage = async (code: string) => {
    try {
      await i18n.changeLanguage(code);
      await AsyncStorage.setItem('appLanguage', code);
      console.log('[LanguageSelector] Language persisted:', code);
    } catch (err) {
      console.error('[LanguageSelector] Storage error:', err);
    }
  };

  return (
    <View style={styles.container}>
      {!vertical && <Text style={styles.label}>Change Language</Text>}
      <View style={[styles.buttonRow, vertical && styles.buttonColumn]}>
        {languages.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.langBtn,
              currentLang === lang.code && styles.langBtnActive
            ]}
            onPress={() => changeLanguage(lang.code)}
          >
            <Text style={[
              styles.langText,
              currentLang === lang.code && styles.langTextActive
            ]}>
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 10,
    color: '#aaa',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 4,
  },
  langBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#eee',
  },
  langBtnActive: {
    backgroundColor: '#B8860B',
    borderColor: '#B8860B',
  },
  langText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#999',
  },
  langTextActive: {
    color: '#fff',
  },
});
