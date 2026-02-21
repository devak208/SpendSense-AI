import { Feather } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/Colors';
import { getUserByClerkId } from '@/lib/supabase';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
};

type ChatSession = {
  id: string;
  title: string;
  created_at: string;
};

export default function ChatScreen() {
  const { user } = useUser();
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-300)).current; // For sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // History State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Streaming refs
  const rawResponse = useRef('');
  const targetText = useRef('');
  const displayedText = useRef('');
  const processedRawIndex = useRef(0);
  const isStreaming = useRef(false);
  const currentAiResponseId = useRef<string | null>(null);
  const streamInterval = useRef<any>(null);

  const API_URL = 'http://192.168.31.169:3000';

  useEffect(() => {
    return () => {
      if (streamInterval.current) clearInterval(streamInterval.current);
    };
  }, []);

  // Keyboard visibility listener
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Fetch database user ID and sessions on mount
  useEffect(() => {
    const initUser = async () => {
      if (user) {
        try {
          const dbUser = await getUserByClerkId(user.id);
          if (dbUser) {
            setDbUserId(dbUser.id);
          }
        } catch (e) {
          console.error('Error fetching db user:', e);
        }
      }
    };
    initUser();
  }, [user]);

  // Fetch sessions when dbUserId is available
  useEffect(() => {
    if (dbUserId) {
      fetchSessions();
    }
  }, [dbUserId]);

  const fetchSessions = async () => {
    if (!dbUserId) return;
    try {
      setLoadingHistory(true);
      const res = await fetch(`${API_URL}/api/chat/sessions?user_id=${dbUserId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSessions(data);
      }
    } catch (e) {
      console.error('Error fetching sessions:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadSession = async (id: string) => {
    try {
      setIsLoading(true);
      closeSidebar();
      setSessionId(id);

      const res = await fetch(`${API_URL}/api/chat/history?session_id=${id}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        const formattedMessages: Message[] = data.map((msg: any) => ({
          id: msg.id,
          text: msg.text,
          sender: msg.sender,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(formattedMessages);
      }
    } catch (e) {
      console.error('Error loading session:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    closeSidebar();
    setSessionId(null);
    setMessages([{
      id: Date.now().toString(),
      text: "Hello! I'm your financial assistant. I can help you track expenses, set reminders, or answer questions about your spending. How can I help you today?",
      sender: 'ai',
      timestamp: new Date(),
    }]);
  };

  const deleteSession = (id: string, title: string) => {
    Alert.alert(
      'Delete Chat',
      `Delete "${title || 'New Chat'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/chat/sessions?session_id=${id}`, {
                method: 'DELETE',
              });
              // Remove from local state
              setSessions(prev => prev.filter(s => s.id !== id));
              // If we deleted the current session, start a new chat
              if (sessionId === id) {
                startNewChat();
              }
            } catch (e) {
              console.error('Error deleting session:', e);
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]
    );
  };

  const toggleSidebar = () => {
    if (isSidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  };

  const openSidebar = () => {
    setIsSidebarOpen(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    fetchSessions(); // Refresh list when opening
  };

  const closeSidebar = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setIsSidebarOpen(false));
  };

  const startStreamingLoop = () => {
    if (streamInterval.current) clearInterval(streamInterval.current);

    streamInterval.current = setInterval(() => {
      if (!currentAiResponseId.current) return;

      const fullRaw = rawResponse.current;
      if (processedRawIndex.current < fullRaw.length) {
        const newChunk = fullRaw.substring(processedRawIndex.current);
        let textToAdd = newChunk;

        const processingRegex = /\*Processing: ([\w\s]+)\.\.\.\*(\n)?/g;
        const completeRegex = /✓ ([\w\s]+)(\n)?/g;

        let match;
        while ((match = processingRegex.exec(newChunk)) !== null) {
          setProcessingStatus(match[1]);
        }

        if (completeRegex.test(newChunk)) {
          setProcessingStatus(null);
        }

        textToAdd = textToAdd.replace(processingRegex, '');
        textToAdd = textToAdd.replace(completeRegex, '');

        targetText.current += textToAdd;
        processedRawIndex.current = fullRaw.length;
      }

      const currentTarget = targetText.current;
      const currentDisplayed = displayedText.current;
      const distance = currentTarget.length - currentDisplayed.length;

      if (distance > 0) {
        const speed = Math.max(1, Math.min(50, Math.ceil(distance * 0.08)));
        const nextChunk = currentTarget.substring(currentDisplayed.length, currentDisplayed.length + speed);
        displayedText.current += nextChunk;

        setMessages((prev) =>
          prev.map(msg =>
            msg.id === currentAiResponseId.current ? { ...msg, text: displayedText.current } : msg
          )
        );
      } else if (!isStreaming.current && !isLoading) {
        if (streamInterval.current) clearInterval(streamInterval.current);
        setProcessingStatus(null);
      }
    }, 30);
  };

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
    setProcessingStatus(null);
    rawResponse.current = '';
    targetText.current = '';
    displayedText.current = '';
    processedRawIndex.current = 0;
    isStreaming.current = true;

    const aiResponseId = (Date.now() + 1).toString();
    currentAiResponseId.current = aiResponseId;

    const aiPlaceholder: Message = {
      id: aiResponseId,
      text: '',
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, aiPlaceholder]);

    startStreamingLoop();

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/chat`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      let xhrProcessedIndex = 0;

      xhr.onprogress = () => {
        const fullResponse = xhr.responseText;
        const newChunk = fullResponse.substring(xhrProcessedIndex);
        if (newChunk) {
          rawResponse.current += newChunk;
        }
        xhrProcessedIndex = fullResponse.length;
      };

      xhr.onload = () => {
        setIsLoading(false);
        isStreaming.current = false;
        if (xhr.status >= 200 && xhr.status < 300) {
          const newSessionId = xhr.getResponseHeader('x-session-id');
          if (newSessionId && !sessionId) {
            setSessionId(newSessionId);
          }
        } else {
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
        isStreaming.current = false;
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
      isStreaming.current = false;
    }
  };

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, processingStatus]); // Auto-scroll on processing status change too

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.aiMessageContainer
      ]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Feather name="cpu" size={14} color={Colors.primary} />
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userMessageBubble : styles.aiMessageBubble,
          !isUser && { paddingVertical: 8, paddingHorizontal: 12 }
        ]}>
          {isUser ? (
            <Text style={[styles.messageText, styles.userMessageText]}>
              {item.text}
            </Text>
          ) : (
            <Markdown style={markdownStyles} mergeStyle={false}>
              {item.text}
            </Markdown>
          )}
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  const quickPrompts = [
    { icon: 'plus', text: 'Add expense' },
    { icon: 'pie-chart', text: 'Show summary' },
    { icon: 'bell', text: 'Set reminder' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>History</Text>
            <TouchableOpacity onPress={startNewChat} style={styles.newChatButton}>
              <Feather name="edit" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {loadingHistory ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.sessionItem, sessionId === item.id && styles.activeSession]}
                  onPress={() => loadSession(item.id)}
                >
                  <Feather name="message-square" size={16} color={sessionId === item.id ? Colors.primary : Colors.textSecondary} />
                  <Text style={[styles.sessionTitle, sessionId === item.id && styles.activeSessionText]} numberOfLines={1}>
                    {item.title || 'New Chat'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => deleteSession(item.id, item.title)}
                    style={styles.deleteSessionBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="trash-2" size={14} color={Colors.error} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.cream, Colors.background]}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={toggleSidebar} style={styles.headerButton}>
              <Feather name="menu" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerContent}>
              <View style={styles.headerIcon}>
                <Feather name="message-circle" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>AI Assistant</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(tabs)/debts')}
              style={styles.headerButton}
            >
              <Feather name="bell" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Quick Prompts */}
        {messages.length <= 1 && (
          <View style={styles.quickPromptsContainer}>
            <Text style={styles.quickPromptsTitle}>Quick actions</Text>
            <View style={styles.quickPrompts}>
              {quickPrompts.map((prompt, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickPromptChip}
                  onPress={() => setInput(prompt.text)}
                >
                  <Feather name={prompt.icon as any} size={14} color={Colors.primary} />
                  <Text style={styles.quickPromptText}>{prompt.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            processingStatus ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.processingText}>Processing: {processingStatus.replace(/_/g, ' ')}...</Text>
              </View>
            ) : null
          }
        />

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: isKeyboardVisible ? 12 : 60 }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={Colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={1000}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name="send" size={18} color="#FFF" />
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
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 998,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 300,
    backgroundColor: Colors.background,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  newChatButton: {
    padding: 8,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    gap: 12,
  },
  activeSession: {
    backgroundColor: Colors.primaryMuted + '20',
  },
  sessionTitle: {
    flex: 1,
  },
  activeSessionText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  deleteSessionBtn: {
    padding: 4,
  },

  // Header with Gradient
  headerGradient: {
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerButton: {
    padding: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.successLight,
  },

  // Quick Prompts
  quickPromptsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  quickPromptsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  quickPrompts: {
    flexDirection: 'row',
    gap: 8,
  },
  quickPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickPromptText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  // Messages
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userMessageBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  aiMessageBubble: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#FFF',
  },
  aiMessageText: {
    color: Colors.textPrimary,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  aiTimestamp: {
    color: Colors.textMuted,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 16,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'flex-end',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
  processingContainer: {
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  processingText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  heading1: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 5,
  },
  heading2: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 5,
  },
  paragraph: {
    marginBottom: 8,
    marginTop: 0,
  },
  strong: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  code_inline: {
    backgroundColor: Colors.border,
    color: Colors.primary,
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: '#F5F5F5',
    color: Colors.textPrimary,
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  link: {
    color: Colors.secondary,
    textDecorationLine: 'underline',
  },
});
