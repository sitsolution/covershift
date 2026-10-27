import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import adminAuthService from '../services/adminAuthService';

const INPUT = 'w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white';
const LABEL = 'block text-[11.5px] font-bold text-slate mb-[6px]';

function detailOf(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

/** Forgot Password: email → 6-digit code → new password. */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setLoading(true); setError('');
    try {
      const res = await adminAuthService.forgotPassword(email.trim());
      setResendIn(res.resendAvailableInSeconds);
      setDebugOtp(res.debugOtp ?? null);
      setStep('reset');
    } catch (err) {
      setError(detailOf(err, 'Could not send the code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = (e: React.FormEvent) => { e.preventDefault(); sendCode(); };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^\d{6}$/.test(code.trim())) errs.code = 'Enter the 6-digit code from the email.';
    if (newPw.length < 8) errs.newPw = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) errs.newPw = 'Must contain uppercase, lowercase, and a number.';
    if (newPw && confirmPw !== newPw) errs.confirmPw = 'Passwords do not match.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true); setError('');
    try {
      await adminAuthService.resetPassword(email.trim(), code.trim(), newPw);
      setStep('done');
    } catch (err) {
      setError(detailOf(err, 'Could not reset the password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (key: string) =>
    fieldErrors[key] ? <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors[key]}</p> : null;

  return (
    <div className="min-h-screen bg-paper flex items-start justify-center">
      <div className="w-full max-w-[380px] mt-[60px] text-center">

        {/* Logo */}
        <img src="/brand/covershift-logo-light.svg" alt="CoverShift" className="h-[52px] w-auto mx-auto mb-4" />

        <h1 className="font-display font-extrabold text-[19px] text-ink mb-[4px]">
          {step === 'done' ? 'Password updated' : 'Forgot password'}
        </h1>
        <p className="text-[11.5px] text-slate mb-5">
          {step === 'email' && "Enter your account email and we'll send you a reset code."}
          {step === 'reset' && `We've sent a 6-digit code to ${email}. It expires in 10 minutes.`}
          {step === 'done' && 'You can now log in with your new password.'}
        </p>

        {error && (
          <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold text-left">
            {error}
          </div>
        )}

        {step === 'email' && (
          <form className="text-left" onSubmit={handleEmail}>
            <div className="mb-[13px]">
              <label className={LABEL}>Email Address</label>
              <input type="email" required placeholder="admin@yourhospital.com" value={email}
                     onChange={(e) => setEmail(e.target.value)} className={INPUT} />
            </div>
            <button type="submit" disabled={loading}
                    className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60">
              {loading ? 'Sending…' : 'Send Reset Code'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form className="text-left" onSubmit={handleReset}>
            {debugOtp && (
              <div className="mb-3 px-3 py-[9px] bg-info-bg border border-info rounded-[8px] text-[11.5px] text-info font-semibold">
                Dev mode — your code is {debugOtp}
              </div>
            )}
            <div className="mb-[13px]">
              <label className={LABEL}>Reset Code</label>
              <input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code}
                     onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setFieldErrors((p) => ({ ...p, code: '' })); }}
                     className={`${INPUT} tracking-[4px]`} />
              {fieldError('code')}
            </div>
            <div className="mb-[13px]">
              <label className={LABEL}>New Password</label>
              <input type="password" placeholder="Min. 8 chars, uppercase, number" value={newPw}
                     onChange={(e) => { setNewPw(e.target.value); setFieldErrors((p) => ({ ...p, newPw: '' })); }}
                     className={INPUT} />
              {fieldError('newPw')}
            </div>
            <div className="mb-[13px]">
              <label className={LABEL}>Confirm New Password</label>
              <input type="password" placeholder="Repeat new password" value={confirmPw}
                     onChange={(e) => { setConfirmPw(e.target.value); setFieldErrors((p) => ({ ...p, confirmPw: '' })); }}
                     className={INPUT} />
              {fieldError('confirmPw')}
            </div>
            <button type="submit" disabled={loading}
                    className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60">
              {loading ? 'Updating…' : 'Reset Password'}
            </button>
            <p className="text-[11.5px] text-slate mt-3 text-center">
              Didn't get it?{' '}
              {resendIn > 0 ? (
                <span>Resend in {resendIn}s</span>
              ) : (
                <button type="button" onClick={sendCode} disabled={loading} className="font-bold text-navy-2">
                  Resend code
                </button>
              )}
            </p>
          </form>
        )}

        {step === 'done' && (
          <button onClick={() => navigate('/login')}
                  className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px]">
            Back to Login
          </button>
        )}

        {step !== 'done' && (
          <p className="text-[11.5px] text-slate mt-4">
            <button type="button" onClick={() => navigate('/login')} className="font-bold text-navy">
              ‹ Back to Login
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
