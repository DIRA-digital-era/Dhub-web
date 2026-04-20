import { isAfter } from 'date-fns';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Props for the UpdateRequiredScreen component.
 */
interface UpdateRequiredScreenProps {
  status: 'optional' | 'mandatory'; // Whether the update can be skipped
  currentVersion: string;           // Currently installed app version
  latestVersion?: string;          // Latest version available in store
  minSupported?: string;           // Minimum version required to run
  updateUrl?: string;              // URL to the app store listing
  forceUpdateAfter?: string | null; // Timestamp after which update becomes mandatory
  onSkip?: () => void;             // Callback when user skips optional update
}

/**
 * Screen displayed when an update is available or required.
 * Handles both blocking (mandatory) and skippable (optional) updates.
 */
const UpdateRequiredScreen: React.FC<UpdateRequiredScreenProps> = ({
  status,
  currentVersion,
  latestVersion,
  minSupported,
  updateUrl,
  forceUpdateAfter,
  onSkip
}) => {
  // State to hold the formatted time remaining until the force update deadline
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    // Log version info to console for developer debugging
    console.log('[Version Check] Current:', currentVersion);
    console.log('[Version Check] Min Supported:', minSupported);
    console.log('[Version Check] Latest:', latestVersion);
    console.log('[Version Check] Force After:', forceUpdateAfter);

    // If no deadline is provided, we don't need a timer
    if (!forceUpdateAfter) return;

    const deadline = new Date(forceUpdateAfter);

    /**
     * Calculates the difference between now and the deadline and updates the state.
     */
    const updateTimer = () => {
      const now = new Date();
      if (isAfter(deadline, now)) {
        // Calculate time units
        const diff = deadline.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const mins = Math.floor((diff / (1000 * 60)) % 60);
        const secs = Math.floor((diff / 1000) % 60);

        // Format as "Xd Hh Mm Ss" if more than a day, otherwise "HH:MM:SS"
        const timeStr = days > 0
          ? `${days}d ${hours}h ${mins}m ${secs}s`
          : `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        setTimeLeft(timeStr);
      } else {
        // Deadline passed
        setTimeLeft('Expired');
      }
    };

    // Initial run and then every second
    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    // Cleanup interval on unmount
    return () => clearInterval(timer);
  }, [forceUpdateAfter, currentVersion, minSupported, latestVersion]);

  /**
   * Opens the store URL to allow user to update.
   */
  const handleUpdate = () => {
    if (updateUrl) {
      Linking.openURL(updateUrl);
    }
  };

  // Determine if the current state is purely optional
  const isOptional = status === 'optional';

  return (
    <SafeAreaView style={styles.container}>
      {/* Set status bar to dark since background is white */}
      <StatusBar style="dark" />
      <View style={styles.content}>
        {/* App Logo Display */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../../assets/images/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Main Heading Change based on status */}
        <Text style={styles.title}>
          {isOptional ? 'Update Available' : 'Update Required'}
        </Text>

        {/* Informational Text */}
        <Text style={styles.description}>
          {isOptional
            ? `A newer version of Dhub is available. You can continue using this version for a limited time.`
            : 'A new version of Dhub is available. To continue using the app, please update to the latest version.'
          }
        </Text>

        {/* Countdown display - Shown whenever a deadline exists regardless of mandatory/optional status */}
        {forceUpdateAfter && (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownLabel}>Mandatory update in:</Text>
            <Text style={styles.countdownText}>{timeLeft}</Text>
          </View>
        )}

        {/* Primary Action Button */}
        <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
          <Text style={styles.updateButtonText}>Update Now</Text>
        </TouchableOpacity>

        {/* Secondary Action Button - Only visible if the update is optional and the deadline hasn't passed */}
        {isOptional && timeLeft !== 'Expired' && onSkip && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipButtonText}>Maybe Later</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    marginBottom: 40,
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666666',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
  },
  countdownContainer: {
    backgroundColor: '#FFF9E6',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  countdownLabel: {
    fontSize: 14,
    color: '#B8860B',
    marginBottom: 4,
    fontWeight: '500',
  },
  countdownText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#B8860B',
  },
  updateButton: {
    backgroundColor: '#B8860B', // Gold color
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#B8860B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default UpdateRequiredScreen;
