import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/layout/Layout';
import Panel from '../components/ui/Panel';
import ChatDrawer from '../components/ChatDrawer';
import chatService, { ChatRoomOut } from '../services/chatService';

// No app-wide socket tells this page about new messages, so it re-reads the
// list on an interval while open.
const REFRESH_MS = 15_000;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Messages() {
  const [rooms, setRooms] = useState<ChatRoomOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatTarget, setChatTarget] = useState<{ staffId: number; staffName: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRooms(await chatService.listRooms());
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const unreadTotal = rooms.reduce((sum, r) => sum + r.unreadCount, 0);

  return (
    <Layout>
      <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">Messages</h1>
      <p className="text-[11.5px] text-slate mb-4">
        {loading ? '…' : `${rooms.length} conversation${rooms.length === 1 ? '' : 's'}${unreadTotal ? ` · ${unreadTotal} unread` : ''}`}
      </p>

      <Panel>
        {loading ? (
          <p className="text-center text-[12px] text-slate py-8">Loading…</p>
        ) : rooms.length === 0 ? (
          <p className="text-center text-[12px] text-slate py-8">
            No conversations yet. Use Contact on a booking or staff profile to message staff.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {rooms.map((room) => {
              const unread = room.unreadCount > 0;
              return (
                <button
                  key={room.id}
                  onClick={() => setChatTarget({ staffId: room.staffId, staffName: room.staffName })}
                  className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-navy-2/5 transition-colors"
                >
                  <div className="w-9 h-9 flex-none rounded-full bg-navy-2/10 text-navy-2 flex items-center justify-center text-[12px] font-extrabold">
                    {room.staffInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[13px] truncate ${unread ? 'font-extrabold text-ink' : 'font-semibold text-ink'}`}>
                        {room.staffName}
                      </span>
                      <span className="text-[11px] text-slate flex-none">{timeAgo(room.lastMessageAt)}</span>
                    </div>
                    <p className={`text-[12px] truncate ${unread ? 'font-semibold text-ink' : 'text-slate'}`}>
                      {room.lastMessageBody}
                    </p>
                  </div>
                  {unread && (
                    <span className="flex-none min-w-[20px] h-5 px-[6px] rounded-full bg-urgent text-white text-[10.5px] font-bold flex items-center justify-center">
                      {room.unreadCount > 9 ? '9+' : room.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      {chatTarget && (
        <ChatDrawer
          staffId={chatTarget.staffId}
          staffName={chatTarget.staffName}
          // Opening the chat marks it read; refresh so the badge clears.
          onClose={() => { setChatTarget(null); load(); }}
        />
      )}
    </Layout>
  );
}
