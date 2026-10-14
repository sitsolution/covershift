import { NavLink } from 'react-router-dom';

const NAV = [
  { icon: '🧭', label: 'Dashboard',    to: '/superadmin/dashboard'    },
  { icon: '👥', label: 'Users',         to: '/superadmin/users'         },
  { icon: '🛡️', label: 'Roles',         to: '/superadmin/roles'         },
  { icon: '🏥', label: 'Facilities',    to: '/superadmin/facilities'    },
  { icon: '📈', label: 'Reports',       to: '/superadmin/reports'       },
  { icon: '🗂️', label: 'Activity Log',  to: '/superadmin/activity-log'  },
  { icon: '⚙️', label: 'Settings',     to: '/superadmin/settings'      },
];

export default function SuperAdminSidebar() {
  return (
    <div
      className="w-[212px] flex-none flex flex-col"
      style={{ minHeight: '100vh', background: '#081C2C' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-[18px] py-[18px] border-b border-white/10 mb-[10px]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M2 12h4l2-7 4 14 2-9 2 5h6"
            stroke="#5FB4E0"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-display font-extrabold text-[13.5px] text-white">
          Covershift · Super Admin
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col flex-1">
        {NAV.map(({ icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-3 px-[18px] py-[13px] text-[12.5px] font-semibold text-white border-r-[3px] border-white transition-colors'
                : 'flex items-center gap-3 px-[18px] py-[13px] text-[12.5px] font-semibold transition-colors hover:bg-white/10'
            }
            style={({ isActive }) =>
              isActive
                ? { background: 'var(--navy-2, #175E86)', color: '#fff' }
                : { color: '#A9C2D3' }
            }
          >
            <span className="text-[14px] w-4 text-center">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
