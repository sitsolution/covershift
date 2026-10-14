import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperAdminSidebar from './SuperAdminSidebar';
import { useAuth } from '../../store/auth';
import GlobalSearch from './GlobalSearch';
import ProfileMenu from './ProfileMenu';

function getInitials(name: string | null): string {
  if (!name) return 'SA';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function SuperAdminTopbar() {
  const navigate = useNavigate();
  const { fullName } = useAuth();
  const initials = getInitials(fullName);

  return (
    <div className="flex items-center gap-[14px] px-[22px] py-[13px] border-b border-line bg-white">
      {/* Left: title + badge */}
      <span className="font-bold text-[13px] text-ink">Platform Overview</span>
      <span className="inline-flex items-center px-[9px] py-[3px] rounded-full text-[10.5px] font-bold bg-gold-bg text-gold">
        All Facilities
      </span>

      {/* Search */}
      <GlobalSearch mode="superadmin" placeholder="Search users, facilities, roles…" />

      <div className="flex-1" />

      {/* Bell */}
      <div
        onClick={() => navigate('/notifications')}
        className="relative w-8 h-8 rounded-full bg-white border border-line flex items-center justify-center text-[14px] cursor-pointer"
      >
        🔔
      </div>

      {/* SA Avatar → Profile / Log out */}
      <ProfileMenu initials={initials} profilePath="/superadmin/profile" avatarClassName="bg-navy text-white" />
    </div>
  );
}

type Props = {
  children: ReactNode;
};

export default function SuperAdminLayout({ children }: Props) {
  return (
    <div className="flex min-h-screen">
      <SuperAdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <SuperAdminTopbar />
        <main className="flex-1 bg-paper p-[20px_22px] overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
