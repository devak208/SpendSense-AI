import { Feather } from '@expo/vector-icons';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { Colors } from '@/constants/Colors';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
};

export default function ChatScreen() {
  const { user } = useUser();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your financial assistant. I can help you track expenses, set reminders, or answer questions about your spending. How can I help you today?",
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  
  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.51.72.85:3000';

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create a placeholder for the AI response
    const aiResponseId = (Date.now() + 1).toString();
    const aiPlaceholder: Message = {
      id: aiResponseId,
      text: '',
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, aiPlaceholder]);

    try {
      // Use XMLHttpRequest for reliable streaming on React Native / Expo
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/chat`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      let processedIndex = 0;
      let currentAiText = '';

      xhr.onprogress = () => {
        const fullResponse = xhr.responseText;
        const newChunk = fullResponse.substring(processedIndex);
        processedIndex = fullResponse.length;
        
        currentAiText += newChunk;

        setMessages((prev) => 
            prev.map(msg => 
                msg.id === aiResponseId ? { ...msg, text: currentAiText } : msg
            )
        );
      };

      xhr.onload = () => {
        setIsLoading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
            // Check for session header
            const newSessionId = xhr.getResponseHeader('x-session-id');
            if (newSessionId) {
                setSessionId(newSessionId);
            }
        } else {
            // Handle error status
             const errorResponse: Message = {
                id: (Date.now() + 2).toString(),
                text: `Error: ${xhr.status} - ${xhr.responseText}`,
                sender: 'ai',
                timestamp: new Date(),
            };
            setMessages((prev) => prev.filter(m => m.id !== aiResponseId).concat(errorResponse));
        }
      };

      xhr.onerror = () => {
         setIsLoading(false);
         const errorResponse: Message = {
            id: (Date.now() + 2).toString(),
            text: "Network error occurred. Please try again.",
            sender: 'ai',
            timestamp: new Date(),
        };
        setMessages((prev) => prev.filter(m => m.id !== aiResponseId).concat(errorResponse));
      };

      xhr.send(JSON.stringify({
        message: userMessage.text,
        userId: user?.id || 'anonymous',
        sessionId: sessionId,
      }));

    } catch (error) {
      console.error('Chat Error:', error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[
        styles.messageContainer, 
        isUser ? styles.userMessageContainer : styles.aiMessageContainer
      ]}>
        <View style={[
          styles.messageBubble, 
          isUser ? styles.userMessageBubble : styles.aiMessageBubble
        ]}>
          <Text style={[
              styles.messageText, 
              isUser ? styles.userMessageText : styles.aiMessageText,
            ]}>
            {item.text}
          </Text>
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0} // Adjustment might be needed based on headers
      >
        <View style={styles.header}>
            <Text style={styles.title}>AI Assistant</Text>
        </View>

        <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity 
            style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]} 
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20, 
  },
  messageContainer: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 20,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  userMessageBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  aiMessageBubble: {
    backgroundColor: '#35354E', // Lighter purple-grey
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  userMessageText: {
    color: '#FFF',
  },
  aiMessageText: {
    color: '#FFFFFF',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
    opacity: 0.7,
  },
  userTimestamp: {
    color: '#E0E0E0',
  },
  aiTimestamp: {
    color: '#AAAAAA',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A40',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    maxHeight: 120,
    fontSize: 16,
    marginRight: 10,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#4A4A60',
    opacity: 0.5,
  },
});
