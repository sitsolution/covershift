import { useState, useEffect, useRef, useCallback } from 'react';
import chatService, { CHAT_READ_EVENT, DirectMessageOut } from '../services/chatService';

interface Props {
  staffId: number;
  staffName: string;
  onClose: () => void;
}

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

type ConnStatus = 'connecting' | 'open' | 'closed' | 'error';

export default function ChatDrawer({ staffId, staffName, onClose }: Props) {
  const [messages, setMessages] = useState<DirectMessageOut[]>([]);
  const [roomKey, setRoomKey] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Step 1: create/get room then load history ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError('');

    chatService
      .getOrCreateRoom(staffId)
      .then((room) => {
        if (cancelled) return null;
        setRoomKey(room.roomKey);
        return chatService.getHistory(room.roomKey);
      })
      .then((history) => {
        if (cancelled || !history) return;
        setMessages(history.messages);
        // Loading history marks the staff member's messages read.
        window.dispatchEvent(new Event(CHAT_READ_EVENT));
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = err?.response?.data?.detail ?? err?.message ?? 'Failed to load chat.';
        setLoadError(detail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [staffId]);

  // ── Step 2: open WebSocket once roomKey is known ────────────────────────────
  useEffect(() => {
    if (!roomKey) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      setConnStatus('error');
      return;
    }

    // Connect to wherever the REST API lives. In production that is the
    // backend's own host — the site's host (Vercel) has no backend behind it.
    // A relative VITE_API_URL falls back to the page origin (Vite proxy).
    const apiBase = new URL(import.meta.env.VITE_API_URL ?? '/api/v1', window.location.origin);
    const wsBase = apiBase.href.replace(/^http/, 'ws').replace(/\/$/, '');
    const url = `${wsBase}/chat/ws/${roomKey}?token=${token}`;

    setConnStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnStatus('open');

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as { type: string; data: unknown };
        if (frame.type === 'history') {
          setMessages(frame.data as DirectMessageOut[]);
        } else if (frame.type === 'message') {
          const msg = frame.data as DirectMessageOut;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === msg.id);
            return exists ? prev.map((m) => (m.id === msg.id ? msg : m)) : [...prev, msg];
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => setConnStatus('error');
    ws.onclose = () => setConnStatus('closed');

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomKey]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const body = input.trim();
    if (!body) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ body }));
    setInput('');
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Status badge ────────────────────────────────────────────────────────────
  const statusDot: Record<ConnStatus, string> = {
    connecting: 'bg-yellow-400',
    open: 'bg-green-500',
    closed: 'bg-slate-400',
    error: 'bg-red-500',
  };
  const statusLabel: Record<ConnStatus, string> = {
    connecting: 'Connecting…',
    open: 'Connected',
    closed: 'Disconnected',
    error: 'Connection error',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Drawer */}
      <div
        className="relative z-10 flex flex-col w-[400px] h-full bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <div className="w-9 h-9 rounded-full bg-sky flex items-center justify-center font-extrabold text-[12px] text-navy flex-shrink-0">
            {initials(staffName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[13px] text-ink leading-tight">{staffName}</p>
            <div className="flex items-center gap-[5px] mt-[2px]">
              <span className={`w-[7px] h-[7px] rounded-full ${statusDot[connStatus]}`} />
              <span className="text-[10px] text-slate">{statusLabel[connStatus]}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate hover:text-ink text-[22px] leading-none font-light flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <p className="text-center text-[12px] text-slate mt-8">Loading…</p>
          ) : loadError ? (
            <p className="text-center text-[12px] text-urgent mt-8">{loadError}</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-[12px] text-slate mt-8">No messages yet. Start the conversation.</p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderRole === 'admin';
              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full bg-sky flex items-center justify-center font-extrabold text-[10px] text-navy flex-shrink-0 mt-1">
                      {initials(msg.senderName)}
                    </div>
                  )}
                  <div className={`max-w-[72%] flex flex-col gap-[2px] ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`px-3 py-[8px] rounded-[12px] text-[12.5px] leading-snug ${
                        isMe
                          ? 'bg-navy text-white rounded-tr-[4px]'
                          : 'bg-sky text-ink rounded-tl-[4px]'
                      }`}
                    >
                      {msg.body}
                    </div>
                    <span className="text-[10px] text-slate">{msgTime(msg.createdAt)}</span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-line px-3 py-3 flex gap-2 items-end">
          <textarea
            className="flex-1 resize-none border border-line rounded-[10px] px-3 py-[8px] text-[12.5px] text-ink placeholder-slate focus:outline-none focus:border-navy"
            placeholder={connStatus === 'open' ? 'Type a message…' : 'Waiting for connection…'}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={connStatus !== 'open'}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || connStatus !== 'open'}
            className="bg-navy text-white text-[12px] font-bold px-4 py-[10px] rounded-[10px] disabled:opacity-40 whitespace-nowrap"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
