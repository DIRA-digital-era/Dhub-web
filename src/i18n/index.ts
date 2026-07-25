import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import fr from './locales/fr.json';
import pcm from './locales/pcm.json';

const RESOURCES = {
  eng: { translation: en },
  fren: { translation: fr },
  pidgin: { translation: pcm },
};

const initI18n = async () => {
  let savedLanguage = await AsyncStorage.getItem('appLanguage');
  
  // Map our app's lang codes to i18n codes if necessary, 
  // but here we used eng, fren, pidgin as keys in RESOURCES to match the app's state.
  
  if (!savedLanguage) {
    savedLanguage = 'eng';
  }

  i18n
    .use(initReactI18next)
    .init({
      resources: RESOURCES,
      lng: savedLanguage,
      fallbackLng: 'eng',
      interpolation: {
        escapeValue: false,
      },
    });
};

initI18n();

export default i18n;
