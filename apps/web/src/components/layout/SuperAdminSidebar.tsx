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
      <div className="flex flex-col gap-[6px] px-[18px] py-[16px] border-b border-white/10 mb-[10px]">
        <img src="/brand/covershift-logo-dark.svg" alt="CoverShift" className="h-[30px] w-auto self-start" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A9C2D3]">Super Admin</span>
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
