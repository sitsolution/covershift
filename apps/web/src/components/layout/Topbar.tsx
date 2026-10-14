import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { api } from '../../services/api';
import GlobalSearch from './GlobalSearch';
import ProfileMenu from './ProfileMenu';

type Props = { facility?: string };

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function Topbar({ facility = '—' }: Props) {
  const navigate = useNavigate();
  const { fullName, accessToken } = useAuth();
  const initials = getInitials(fullName);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!accessToken) return;

    const fetchCount = () => {
      api.get('/notifications/unread-count')
        .then(res => setUnread(res.data?.count ?? 0))
        .catch(() => {});
    };

    fetchCount();
    const timer = setInterval(fetchCount, 30_000);
    return () => clearInterval(timer);
  }, [accessToken]);

  return (
    <div className="flex items-center gap-[14px] px-[22px] py-[13px] border-b border-line bg-white">
      {/* Facility name */}
      <span className="font-bold text-[13px] text-ink">{facility}</span>

      {/* Search */}
      <GlobalSearch mode="admin" />

      <div className="flex-1" />

      {/* Bell */}
      <div onClick={() => navigate('/notifications')} className="relative w-8 h-8 rounded-full bg-white border border-line flex items-center justify-center text-[14px] cursor-pointer">
        🔔
        {unread > 0 && (
          <span className="absolute top-[5px] right-[6px] w-[7px] h-[7px] rounded-full bg-urgent border-[1.5px] border-white" />
        )}
      </div>

      {/* Avatar → Profile / Log out */}
      <ProfileMenu initials={initials} profilePath="/settings" avatarClassName="bg-sky text-navy" />
    </div>
  );
}
