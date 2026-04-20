//Dhub/SplashScreen.tsx
import * as Font from "expo-font";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  View
} from "react-native";
import Svg, { Path } from "react-native-svg";

const COLORS = {
  background: "#4f4a4c",
  logo: "#D4AF37", // gold
  subtext: "#a0a0a0",
};

const DURATION = 5200; // ms (same as your web)

type Props = {
  onAnimationEnd?: () => void;
};

export default function SplashScreen({ onAnimationEnd }: Props) {
  // animation values
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  // stroke dash for the smoke lines (two separate anims)
  const smoke1Offset = useRef(new Animated.Value(100)).current;
  const smoke2Offset = useRef(new Animated.Value(100)).current;

  // font loading state
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // load fonts (non-blocking; fallback ok)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Font.loadAsync({
          Montserrat: require("../../assets/fonts/Montserrat-Regular.ttf"),
          "Montserrat-Bold": require("../../assets/fonts/Montserrat-Bold.ttf"),
          // if you don't have these font files, simply remove/skip — fallback used
        });
      } catch (e) {
        // silent: fallback to system fonts if not present
      } finally {
        if (mounted) setFontsLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // animation timeline mirrors your CSS keyframes and durations.
    // We'll sequence:
    // 0 - 900ms: logo unfold (scale + opacity)
    // 900 - 1700ms: reveal text (title + subtitle) with delay
    // Smoke: start early (100-500ms), draw then fade out around 1500-2000ms
    const logoAnim = Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const smokeAnim = Animated.sequence([
      Animated.delay(80), // start shortly after mount
      Animated.parallel([
        Animated.timing(smoke1Offset, {
          toValue: 0,
          duration: 520, // fast draw
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(smoke2Offset, {
          toValue: 0,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      // keep visible a bit then fade by driving text opacity (we'll not animate stroke alpha directly)
      Animated.delay(800),
    ]);

    const textAnim = Animated.timing(textOpacity, {
      toValue: 1,
      duration: 800,
      delay: 900, // starts after logo anim
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    });

    // Combined timeline: run logo + smoke concurrently, then text
    Animated.parallel([Animated.sequence([logoAnim, textAnim]), smokeAnim]).start(
      () => {
        // total animation end at ~DURATION (5200ms)
        if (onAnimationEnd) {
          // Give a tiny delay to match your web timing fidelity
          setTimeout(() => onAnimationEnd(), 120);
        }
      }
    );
  }, [logoScale, logoOpacity, textOpacity, smoke1Offset, smoke2Offset, onAnimationEnd]);

  // strokeDashoffset interpolation to use in SVG stroke
  const strokeDashoffset1 = smoke1Offset.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 100],
  });
  const strokeDashoffset2 = smoke2Offset.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 100],
  });

  // sizes tuned for common phone screens, responsive-ish
  const SVG_SIZE = 220;
  const LOGO_BOX = {
    width: 200,
    height: 200,
  };

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      {!fontsLoaded && (
        <View style={styles.fontLoader}>
          <ActivityIndicator size="small" color={COLORS.logo} />
        </View>
      )}

      <Animated.View
        style={[
          styles.logoWrapper,
          {
            transform: [{ scale: logoScale }],
            opacity: logoOpacity,
            width: LOGO_BOX.width,
            height: LOGO_BOX.height,
          },
        ]}
      >
        <Svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Main House/D shape path (exact from your web copy) */}
          <Path
            d="M 50 100 L 50 150 L 100 150 L 100 100 L 150 100 L 150 50 L 100 50 L 50 100 Z M 75 125 L 75 100 L 100 100 L 100 125 Z"
            fill={COLORS.logo}
          />
          {/* Smoke / wavy lines - animate strokeDashoffset */}
          <AnimatedStroke
            d="M 150 50 C 160 40, 170 30, 160 20 C 150 10, 140 10, 130 20"
            stroke={COLORS.logo}
            strokeWidth={4}
            strokeLinecap="round"
            dashoffset={strokeDashoffset1}
          />
          <AnimatedStroke
            d="M 150 50 C 140 40, 130 30, 140 20 C 150 10, 160 10, 170 20"
            stroke={COLORS.logo}
            strokeWidth={4}
            strokeLinecap="round"
            dashoffset={strokeDashoffset2}
          />
        </Svg>
      </Animated.View>

      <Animated.Text
        style={[
          styles.title,
          {
            opacity: textOpacity,
            color: COLORS.logo,
            fontFamily: fontsLoaded ? "Montserrat-Bold" : undefined,
          },
        ]}
      >
        HUB
      </Animated.Text>

      <Animated.Text
        style={[
          styles.subtitle,
          { opacity: textOpacity, color: COLORS.subtext, fontFamily: fontsLoaded ? "Montserrat" : undefined },
        ]}
      >
        HOUSING PLATFORM
      </Animated.Text>
    </View>
  );
}

/**
 * Helper component: Animated stroke Path wrapper for react-native-svg
 * Accepts animated prop `dashoffset` (Animated.Node)
 */
function AnimatedStroke({
  d,
  stroke,
  strokeWidth,
  strokeLinecap,
  dashoffset,
}: {
  d: string;
  stroke: string;
  strokeWidth?: number;
  strokeLinecap?: "butt" | "round" | "square";
  dashoffset: any;
}) {
  // react-native-svg doesn't accept animated values directly on Path props,
  // so we forward via style transform using strokeDashoffset prop via animated props.
  const animatedProps = {
    strokeDasharray: [100],
    strokeDashoffset: dashoffset as any,
  };

  // @ts-ignore - Animated.createAnimatedComponent returns a component
  const AnimatedPath = Animated.createAnimatedComponent(Path);

  return (
    <AnimatedPath
      d={d}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap={strokeLinecap}
      fill="none"
      {...(animatedProps as any)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fontLoader: {
    position: "absolute",
    top: 40,
    right: 20,
  },
  logoWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: -10,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 12,
    letterSpacing: 5,
  },
});
