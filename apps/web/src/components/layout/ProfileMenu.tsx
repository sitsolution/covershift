import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';

type Props = {
  initials: string;
  /** Where "Profile" goes — /settings for a facility admin, /superadmin/profile for the platform. */
  profilePath: string;
  /** Avatar colours differ between the two panels. */
  avatarClassName: string;
};

export default function ProfileMenu({ initials, profilePath, avatarClassName }: Props) {
  const navigate = useNavigate();
  const { fullName, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Opens on hover. Closing waits a moment so the pointer can cross the gap
  // between the avatar and the menu. A tap also opens it, for touch screens;
  // tapping outside or pressing Esc closes it.
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const openNow = () => { cancelClose(); setOpen(true); };
  const closeSoon = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 150); };

  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path: string) => { setOpen(false); navigate(path); };

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <div ref={ref} className="relative flex-none" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        onClick={openNow}
        aria-haspopup="menu"
        aria-expanded={open}
        title={fullName ?? ''}
        className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-extrabold cursor-pointer ${avatarClassName}`}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[38px] z-50 w-[200px] bg-white border border-line rounded-[10px] shadow-lg py-1"
        >
          {fullName && (
            <div className="px-3 py-2 border-b border-line mb-1">
              <p className="text-[12px] font-bold text-ink truncate">{fullName}</p>
            </div>
          )}
          <button
            role="menuitem"
            onClick={() => go(profilePath)}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-ink hover:bg-paper text-left"
          >
            <span className="w-4 text-center">👤</span> Profile
          </button>
          <button
            role="menuitem"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-urgent hover:bg-paper text-left"
          >
            <span className="w-4 text-center">🚪</span> Log out
          </button>
        </div>
      )}
    </div>
  );
}
