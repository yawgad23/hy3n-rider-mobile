import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, Modal, Animated,
  Dimensions, ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { firestoreDB } from '@/lib/firebase';

const GOLD = '#D4AF37';
const BG = '#111111';
const CARD = '#1A1A1A';
const BORDER = '#2A2A2A';
const TEXT = '#FAFAFA';
const MUTED = '#9CA3AF';
const GREEN = '#22C55E';
const SCREEN_HEIGHT = Dimensions.get('window').height;

const QUICK_REPLIES = [
  { icon: 'directions-car', text: 'On my way' },
  { icon: 'place', text: "I've arrived" },
  { icon: 'access-time', text: '2 mins away' },
  { icon: 'phone', text: 'Please call me' },
];

interface Message {
  id: string;
  ride_id: string;
  sender_id: string;
  sender_role: 'driver' | 'rider';
  sender_name?: string;
  message: string;
  created_date?: string;
  read_by_driver?: boolean;
  read_by_rider?: boolean;
}

interface RideChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  rideId: string;
  currentUserId: string;
  currentUserRole: 'driver' | 'rider';
  currentUserName?: string;
}

function ChatBubble({ msg, isMine, currentRole }: { msg: Message; isMine: boolean; currentRole: string }) {
  const time = msg.created_date
    ? new Date(msg.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const isRead = currentRole === 'rider' ? msg.read_by_driver : msg.read_by_rider;

  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View style={[styles.bubbleContainer, isMine ? styles.bubbleContainerRight : styles.bubbleContainerLeft]}>
        {!isMine && (
          <Text style={styles.senderName}>{msg.sender_name || msg.sender_role}</Text>
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {msg.message}
          </Text>
        </View>
        <View style={styles.bubbleMeta}>
          <Text style={styles.bubbleTime}>{time}</Text>
          {isMine && (
            <MaterialIcons
              name={isRead ? 'done-all' : 'done'}
              size={12}
              color={isRead ? GOLD : MUTED}
            />
          )}
        </View>
      </View>
    </View>
  );
}

export function RideChatModal({
  isOpen,
  onClose,
  rideId,
  currentUserId,
  currentUserRole,
  currentUserName,
}: RideChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 28,
        stiffness: 320,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !rideId) return;
    setMessages([]);
    setShowQuickReplies(true);

    // Subscribe to real-time messages
    const unsubscribe = firestoreDB.subscribe(
      'ride_messages',
      { ride_id: rideId },
      (msgs: Message[]) => {
        msgs.sort((a, b) =>
          new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime()
        );
        setMessages(msgs);

        // Mark messages as read
        const updateField = currentUserRole === 'rider' ? 'read_by_rider' : 'read_by_driver';
        msgs.forEach((msg) => {
          if (msg.sender_role !== currentUserRole && msg.sender_id !== currentUserId && !msg[updateField]) {
            firestoreDB.update('ride_messages', msg.id, { [updateField]: true }).catch(() => {});
          }
        });
      }
    );

    return () => unsubscribe?.();
  }, [isOpen, rideId, currentUserId, currentUserRole]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const sendMessage = async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || sending) return;
    setSending(true);

    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      ride_id: rideId,
      sender_id: currentUserId,
      sender_role: currentUserRole,
      sender_name: currentUserName || currentUserRole,
      message: trimmed,
      created_date: new Date().toISOString(),
      read_by_driver: currentUserRole === 'driver',
      read_by_rider: currentUserRole === 'rider',
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setText('');
    setShowQuickReplies(false);

    try {
      await firestoreDB.create('ride_messages', {
        ride_id: rideId,
        sender_id: currentUserId,
        sender_role: currentUserRole,
        sender_name: currentUserName || currentUserRole,
        message: trimmed,
        created_date: new Date().toISOString(),
        read_by_driver: false,
        read_by_rider: false,
      });
    } catch (e) {
      console.warn('[RideChatModal] Failed to send message:', e);
    }
    setSending(false);
  };

  if (!isOpen) return null;

  return (
    <Modal transparent animationType="none" visible={isOpen} onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Ride Chat</Text>
            <Text style={styles.headerSub}>Coordinate safely without sharing numbers</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={18} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <MaterialIcons name="chat" size={24} color={GOLD} />
                </View>
                <Text style={styles.emptyTitle}>Start coordinating</Text>
                <Text style={styles.emptyText}>Use quick replies or type a message</Text>
              </View>
            }
            renderItem={({ item }) => (
              <ChatBubble
                msg={item}
                isMine={item.sender_id === currentUserId}
                currentRole={currentUserRole}
              />
            )}
          />

          {/* Quick Replies */}
          {showQuickReplies && (
            <View style={styles.quickRepliesContainer}>
              <View style={styles.quickRepliesHeader}>
                <Text style={styles.quickRepliesLabel}>QUICK REPLIES</Text>
                <TouchableOpacity onPress={() => setShowQuickReplies(false)}>
                  <MaterialIcons name="keyboard-arrow-down" size={18} color={MUTED} />
                </TouchableOpacity>
              </View>
              <View style={styles.quickRepliesRow}>
                {QUICK_REPLIES.map((qr, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.quickReplyBtn}
                    onPress={() => sendMessage(qr.text)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name={qr.icon as any} size={14} color={GOLD} />
                    <Text style={styles.quickReplyText}>{qr.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Input */}
          <View style={styles.inputRow}>
            {!showQuickReplies && (
              <TouchableOpacity style={styles.quickRepliesToggle} onPress={() => setShowQuickReplies(true)}>
                <MaterialIcons name="keyboard-arrow-up" size={18} color={MUTED} />
              </TouchableOpacity>
            )}
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message..."
              placeholderTextColor={MUTED}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(text)}
              multiline={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={() => sendMessage(text)}
              disabled={!text.trim() || sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <MaterialIcons name="send" size={18} color="#000" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// Unread count hook for badge display
export function useUnreadChatCount(rideId: string | null, currentUserId: string, currentUserRole: 'driver' | 'rider') {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!rideId) { setUnreadCount(0); return; }
    const readField = currentUserRole === 'rider' ? 'read_by_rider' : 'read_by_driver';
    const unsubscribe = firestoreDB.subscribe(
      'ride_messages',
      { ride_id: rideId },
      (msgs: Message[]) => {
        const unread = msgs.filter(
          (m) => m.sender_role !== currentUserRole && m.sender_id !== currentUserId && !m[readField]
        ).length;
        setUnreadCount(unread);
      }
    );
    return () => unsubscribe?.();
  }, [rideId, currentUserId, currentUserRole]);

  return unreadCount;
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85, minHeight: SCREEN_HEIGHT * 0.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 20,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  headerSub: { fontSize: 11, color: MUTED, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  keyboardView: { flex: 1 },
  messageList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  emptyState: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1A1400', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 4 },
  emptyText: { fontSize: 12, color: MUTED, textAlign: 'center' },
  bubbleRow: { marginBottom: 8 },
  bubbleRowRight: { alignItems: 'flex-end' },
  bubbleRowLeft: { alignItems: 'flex-start' },
  bubbleContainer: { maxWidth: '78%' },
  bubbleContainerRight: { alignItems: 'flex-end' },
  bubbleContainerLeft: { alignItems: 'flex-start' },
  senderName: { fontSize: 10, fontWeight: '600', color: MUTED, marginBottom: 3, paddingHorizontal: 4, textTransform: 'capitalize' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: GOLD, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: CARD, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#000' },
  bubbleTextTheirs: { color: TEXT },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, paddingHorizontal: 4 },
  bubbleTime: { fontSize: 10, color: MUTED },
  quickRepliesContainer: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, paddingBottom: 8 },
  quickRepliesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  quickRepliesLabel: { fontSize: 10, fontWeight: '600', color: MUTED, letterSpacing: 1 },
  quickRepliesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  quickReplyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: BORDER },
  quickReplyText: { fontSize: 12, fontWeight: '600', color: TEXT },
  quickRepliesToggle: { width: 36, height: 36, borderRadius: 10, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: BORDER, paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
  input: { flex: 1, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: TEXT, borderWidth: 1, borderColor: BORDER, maxHeight: 80 },
  sendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
