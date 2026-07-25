import 'dotenv/config';

export default ({ config }) => {
  return {
    ...config,

    name: "Dhub",
    slug: "dhub",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "dhub",
    userInterfaceStyle: "automatic",
    newArchEnabled: true, // Matching Expo Go to ensure dev/prod consistency

    android: {
      package: "com.dira.dhub",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "pan",
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID || "AIzaSyAyARtsl2_R9zn_payaszS6Qj3Yhws9KD8"
        }
      }
    },
    ios: {
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_IOS || "AIzaSyCsoZGBWKi6YE1EDkkz2G3suRA2orqhGQA"
      }
    },

    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-maps",
      "expo-sqlite",
      "expo-secure-store",
      "expo-font",
      "expo-video",
      "expo-asset",
      "@react-native-community/datetimepicker",
      "expo-web-browser",

      [
        "expo-image-picker",
        {
          photosPermission: "We need access to your photos to upload KYC documents.",
          cameraPermission: "We need camera access to take ID photos if needed."
        }
      ],


      [
        "expo-build-properties",
        {
          "android": {
            "kotlinVersion": "2.0.21"
          }
        }
      ],


      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#FFFFFF",  // Light mode: clean white
          dark: {
            image: "./assets/images/splash-icon.png",
            imageWidth: 200,
            resizeMode: "contain",
            backgroundColor: "#0D1117",  // Dark mode: deep DHUB navy (matches app dark bg)
          },
        },
      ],
    ],

    experiments: {
      typedRoutes: false,
      reactCompiler: false,
    },

    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
      DIRA_PAYMENT_URL: process.env.DIRA_PAYMENT_URL,
      eas: {
        projectId: "b0659e77-bb69-4083-96dd-5b4155a1b80e"
      }
    },
  };
};

