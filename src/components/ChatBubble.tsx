import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ChatBubbleProps {
  message: string;
  isSender: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isSender }) => {
  return (
    <View style={[styles.bubble, isSender ? styles.sender : styles.receiver]}>
      <Text style={{ color: isSender ? '#fff' : '#000' }}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '70%',
    padding: 10,
    marginVertical: 4,
    borderRadius: 12,
  },
  sender: {
    backgroundColor: '#1E40AF',
    alignSelf: 'flex-end',
  },
  receiver: {
    backgroundColor: '#E5E7EB',
    alignSelf: 'flex-start',
  },
});

export default ChatBubble;
