import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [showCf, setShowCf]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone]             = useState(false);

  useEffect(() => {
    if (!token) setError('Invalid invitation link. Please ask your admin to resend the invitation.');
  }, [token]);

  async function handleSubmit() {
    if (!token) return;
    const errs: Record<string, string> = {};
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (!confirm) errs.confirm = 'Please confirm your password.';
    else if (password && password !== confirm) errs.confirm = 'Passwords do not match.';
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSubmitting(true);
    setError('');
    try {
      await api.post('/auth/accept-invitation', { token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'This invitation link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="font-display font-extrabold text-[22px] text-navy tracking-tight">Covershift</div>
          <div className="text-[12px] text-slate mt-1">Admin Portal</div>
        </div>

        <div className="bg-white border border-line rounded-[14px] p-6 shadow-sm">
          {done ? (
            <div className="text-center py-4">
              <div className="text-[28px] mb-3">✓</div>
              <div className="font-display font-extrabold text-[15px] text-ink mb-1">
                Password set successfully
              </div>
              <div className="text-[12px] text-slate">
                Redirecting you to login…
              </div>
            </div>
          ) : (
            <>
              <div className="font-display font-extrabold text-[15px] text-ink mb-1">
                Accept Invitation
              </div>
              <div className="text-[11.5px] text-slate mb-5">
                Set a password to activate your admin account.
              </div>

              {error && (
                <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
                  {error}
                </div>
              )}

              <div className="mb-[13px]">
                <label className="block text-[11.5px] font-bold text-slate mb-[6px]">New Password<span className="text-urgent ml-[2px]">*</span></label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                    placeholder="At least 8 characters"
                    className={`w-full px-3 py-[11px] pr-11 border-[1.4px] ${fieldErrors.password ? 'border-urgent' : 'border-line'} rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white`}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink" tabIndex={-1}>
                    <EyeIcon open={showPw} />
                  </button>
                </div>
                {fieldErrors.password && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.password}</p>}
              </div>

              <div className="mb-5">
                <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Confirm Password<span className="text-urgent ml-[2px]">*</span></label>
                <div className="relative">
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setFieldErrors(p => ({ ...p, confirm: '' })); }}
                    placeholder="Repeat your password"
                    className={`w-full px-3 py-[11px] pr-11 border-[1.4px] ${fieldErrors.confirm ? 'border-urgent' : 'border-line'} rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white`}
                  />
                  <button type="button" onClick={() => setShowCf(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink" tabIndex={-1}>
                    <EyeIcon open={showCf} />
                  </button>
                </div>
                {fieldErrors.confirm && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.confirm}</p>}
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !token}
                className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60 hover:bg-navy-2 transition-colors cursor-pointer"
              >
                {submitting ? 'Activating account…' : 'Set Password & Log In'}
              </button>
            </>
          )}
        </div>

        <div className="text-center mt-4">
          <a href="/login" className="text-[11.5px] text-slate hover:text-navy">
            Already have a password? Log in
          </a>
        </div>
      </div>
    </div>
  );
}
