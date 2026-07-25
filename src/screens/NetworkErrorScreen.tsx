// src/screens/NetworkErrorScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

interface Props {
  onRetry: () => void; // Callback to retry network request
}

const NetworkErrorScreen: React.FC<Props> = ({ onRetry }) => {
  return (
    <View style={styles.container}>
      {/* Replace with your actual broken cable/network image */}
      <Image source={require('../../assets/network-broken.png')} style={styles.image} />

      <Text style={styles.title}>Oops! No Internet</Text>
      <Text style={styles.subtitle}>
        Please check your connection and try again.
        If this error persists you can contact support.
      </Text>

      <TouchableOpacity style={styles.button} onPress={onRetry} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  image: {
    width: 150,
    height: 150,
    marginBottom: 20,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default NetworkErrorScreen;
