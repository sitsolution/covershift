import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import chatService, { DirectMessageOut } from '../../services/chatService';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Chat'>;
  route: RouteProp<HomeStackParamList, 'Chat'>;
};

function msgTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function initials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.replace(/\./g, '').split(' ').filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ChatScreen({ navigation, route }: Props) {
  const insideTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const { roomKey, adminName } = route.params;

  const [messages, setMessages] = useState<DirectMessageOut[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const history = await chatService.getHistory(roomKey);
      // Inverted FlatList expects newest-first order
      setMessages([...history.messages].reverse());
    } catch {}
    setLoading(false);

    const url = await chatService.buildWsUrl(roomKey);
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as { type: string; data: unknown };
        if (frame.type === 'history') {
          const msgs = frame.data as DirectMessageOut[];
          setMessages([...msgs].reverse());
        } else if (frame.type === 'message') {
          const msg = frame.data as DirectMessageOut;
          // Prepend to inverted list (newest first = top of array = visual bottom)
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === msg.id);
            return exists ? prev : [msg, ...prev];
          });
        }
      } catch {}
    };
  }, [roomKey]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const handleSend = () => {
    const body = input.trim();
    if (!body || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ body }));
    setInput('');
  };

  const renderMessage = ({ item }: { item: DirectMessageOut }) => {
    const isStaff = item.senderRole === 'staff';
    return (
      <View style={[styles.msgRow, isStaff ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isStaff && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(item.senderName)}</Text>
          </View>
        )}
        <View style={styles.msgCol}>
          <View style={[styles.bubble, isStaff ? styles.bubbleStaff : styles.bubbleAdmin]}>
            <Text style={[styles.bubbleText, isStaff ? styles.bubbleTextStaff : styles.bubbleTextAdmin]}>
              {item.body}
            </Text>
          </View>
          <Text style={[styles.timeText, isStaff && styles.timeTextRight]}>
            {msgTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    // No <Screen> wrapper — it has its own KAV which conflicts. Use SafeAreaView directly.
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* App Bar */}
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.appbarCenter}>
          <Text style={styles.appbarTitle}>{adminName}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, connected ? styles.statusOnline : styles.statusOffline]} />
            <Text style={styles.appbarSub}>{connected ? 'Online' : 'Connecting…'}</Text>
          </View>
        </View>
        <View style={styles.spacer} />
      </View>

      {/* KAV wraps message list + input only — appbar stays fixed */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#1A2E52" />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No messages yet.{'\n'}Your admin will reach out to you here.</Text>
              </View>
            }
          />
        )}

        {/* Input bar — KAV pushes this up when keyboard opens */}
        {/* With the tab bar showing below, it already clears the phone's nav bar. */}
        <SafeAreaView edges={insideTabs ? [] : ['bottom']} style={styles.inputSafe}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Type a message…"
              placeholderTextColor="#A9B8C4"
              value={input}
              onChangeText={setInput}
              multiline
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || !connected) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || !connected}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1, backgroundColor: '#F7F9FB' },
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF3',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backArrow: { fontSize: 28, color: '#1A2E52', lineHeight: 32 },
  appbarCenter: { flex: 1, alignItems: 'center' },
  appbarTitle: { fontSize: 14, fontWeight: '800', color: '#1A2E52' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusOnline: { backgroundColor: '#1F8A5F' },
  statusOffline: { backgroundColor: '#F4A418' },
  appbarSub: { fontSize: 11, color: '#7A90A4' },
  spacer: { width: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 8 },
  emptyWrap: { flex: 1, paddingTop: 60, alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#7A90A4', fontSize: 13, lineHeight: 20 },
  msgRow: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#E8F0FB',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8,
  },
  avatarText: { fontSize: 10, fontWeight: '800', color: '#1A2E52' },
  msgCol: { maxWidth: '72%' },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleAdmin: { backgroundColor: '#E8F0FB', borderTopLeftRadius: 4 },
  bubbleStaff: { backgroundColor: '#1A2E52', borderTopRightRadius: 4 },
  bubbleText: { fontSize: 13, lineHeight: 19 },
  bubbleTextAdmin: { color: '#1A2E52' },
  bubbleTextStaff: { color: '#fff' },
  timeText: { fontSize: 10, color: '#A9B8C4', marginTop: 3 },
  timeTextRight: { textAlign: 'right' },
  inputSafe: { backgroundColor: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8EEF3',
  },
  input: {
    flex: 1,
    borderWidth: 1.4,
    borderColor: '#E8EEF3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1A2E52',
    maxHeight: 100,
    backgroundColor: '#F7F9FB',
  },
  sendBtn: {
    backgroundColor: '#1A2E52',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
