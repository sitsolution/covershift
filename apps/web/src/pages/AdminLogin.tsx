import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import adminAuthService from '../services/adminAuthService';
import { useAuth } from '../store/auth';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { saveTokens } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await adminAuthService.login(email, password);
      if (res.role !== 'facility_admin' && res.role !== 'super_admin') {
        setError('This account does not have admin access.');
        return;
      }
      setError('');
      saveTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: res.role,
        userId: res.userId,
        fullName: res.fullName,
      });
      navigate(res.role === 'super_admin' ? '/superadmin/dashboard' : '/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Invalid email or password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-start justify-center">
      <div className="w-full max-w-[380px] mt-[60px] text-center">

        {/* Logo */}
        <div className="w-[52px] h-[52px] rounded-[14px] bg-navy flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M2 12h4l2-7 4 14 2-9 2 5h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="font-display font-extrabold text-[19px] text-ink mb-[4px]">Welcome back</h1>
        <p className="text-[11.5px] text-slate mb-5">Login to your facility dashboard</p>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold text-left">
            {error}
          </div>
        )}

        {/* Form */}
        <form className="text-left" onSubmit={handleLogin}>
          <div className="mb-[13px]">
            <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Email Address</label>
            <input
              type="email"
              placeholder="admin@yourhospital.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white"
            />
          </div>
          <div className="mb-[13px]">
            <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 pr-10 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink"
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-right mb-4" style={{ marginTop: '-6px' }}>
            <button type="button" onClick={() => navigate('/forgot-password')}
                    className="text-[11.5px] font-bold text-navy-2 cursor-pointer">
              Forgot Password?
            </button>
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
          >
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-[11.5px] text-slate mt-4">
          New facility?{' '}
          <span className="font-bold text-navy cursor-pointer">Request Demo</span>
        </p>
      </div>
    </div>
  );
}
