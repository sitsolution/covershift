import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import chatService, { CHAT_READ_EVENT } from '../../services/chatService';
import { useAuth } from '../../store/auth';

// permission: null means always visible (no permission required)
const NAV: { icon: string; label: string; to: string; permission: string | null }[] = [
  { icon: '📊', label: 'Dashboard',   to: '/dashboard',    permission: null          },
  { icon: '🩺', label: 'Shifts',      to: '/shifts',       permission: 'shifts'      },
  { icon: '👨‍⚕️', label: 'Staff',       to: '/staff',        permission: 'staff'       },
  { icon: '📋', label: 'Bookings',    to: '/bookings',     permission: 'bookings'    },
  { icon: '💬', label: 'Messages',    to: '/messages',     permission: null          },
  { icon: '📁', label: 'Documents',   to: '/documents',    permission: 'documents'   },
  { icon: '📈', label: 'Reports',     to: '/reports',      permission: 'reports'     },
  { icon: '🕓', label: 'Activity Log',to: '/activity-log', permission: 'activity_log'},
  { icon: '⚙️', label: 'Settings',    to: '/settings',     permission: null          },
];

export default function Sidebar() {
  const { role, permissions, accessToken } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Dot on Messages: poll like the notification bell, and refresh at once
  // when a chat is opened and marked read.
  useEffect(() => {
    if (!accessToken) return;
    const fetchCount = () => chatService.unreadCount().then(setUnreadMessages).catch(() => {});
    fetchCount();
    const timer = setInterval(fetchCount, 30_000);
    window.addEventListener(CHAT_READ_EVENT, fetchCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener(CHAT_READ_EVENT, fetchCount);
    };
  }, [accessToken]);

  // super_admin (platform) sees everything; facility_admin sees based on permissions
  const canSee = (permission: string | null) => {
    if (permission === null) return true;           // always-visible items
    if (role === 'super_admin') return true;        // platform super admin
    if (permissions === null) return true;          // still loading — show all
    return permissions.includes(permission);
  };

  return (
    <div className="w-[212px] flex-none bg-navy-3 flex flex-col" style={{ minHeight: '100vh' }}>
      {/* Brand */}
      <div className="flex items-center gap-2 px-[18px] py-[18px] border-b border-white/10 mb-[10px]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M2 12h4l2-7 4 14 2-9 2 5h6" stroke="#5FB4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="font-display font-extrabold text-[13.5px] text-white">Covershift · Admin</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col flex-1">
        {NAV.filter(({ permission }) => canSee(permission)).map(({ icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `adm-item${isActive ? ' active' : ''}`
            }
          >
            <span className="text-[14px] w-4 text-center">{icon}</span>
            {label}
            {to === '/messages' && unreadMessages > 0 && (
              <span
                className="ml-auto w-[8px] h-[8px] rounded-full bg-urgent"
                aria-label={`${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`}
                title={`${unreadMessages} unread`}
              />
            )}
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
