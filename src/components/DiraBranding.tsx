import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';

export const DiraBranding: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Built with 💛 by{' '}
        <Text 
          style={styles.brand} 
          onPress={() => Linking.openURL('https://diracmr.com')}
        >
          DIRA
        </Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 12,
    color: '#999',
    letterSpacing: 0.5,
  },
  brand: {
    fontWeight: 'bold',
    color: '#B8860B',
    textDecorationLine: 'underline',
  },
});
