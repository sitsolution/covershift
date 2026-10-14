import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import adminSettingsService from '../../services/adminSettingsService';
import { useAuth } from '../../store/auth';

const INPUT = 'w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white';
const INPUT_DISABLED = 'w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-slate bg-paper cursor-not-allowed';
const LABEL = 'block text-[11.5px] font-bold text-slate mb-[6px]';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-[11px] overflow-hidden">
      <div className="px-4 py-[10px] bg-paper border-b border-line">
        <span className="text-[12px] font-bold text-ink">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** The platform super admin's own account — name and password. Facility
 *  admins have the same controls under Settings. */
export default function SAProfile() {
  const { setFullName } = useAuth();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwFieldErrors, setPwFieldErrors] = useState<Record<string, string>>({});
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    adminSettingsService.getMyProfile()
      .then((me) => { setName(me.fullName); setEmail(me.email); })
      .catch(() => setNameError('Failed to load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveName = async () => {
    if (name.trim().length < 3) { setNameError('Full name must be at least 3 characters.'); return; }
    setSaving(true); setNameError(''); setSaved(false);
    try {
      const updated = await adminSettingsService.updateMyProfile({ fullName: name.trim() });
      setName(updated.fullName);
      setFullName(updated.fullName);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setNameError(err?.response?.data?.detail ?? 'Failed to save your name.');
    } finally {
      setSaving(false);
    }
  };

  // Same rules as the facility admin's Change Password form.
  const handleChangePassword = async () => {
    const errs: Record<string, string> = {};
    if (!currentPw) errs.currentPw = 'Current password is required.';
    if (!newPw) errs.newPw = 'New password is required.';
    else if (newPw.length < 8) errs.newPw = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) errs.newPw = 'Must contain uppercase, lowercase, and a number.';
    if (!confirmPw) errs.confirmPw = 'Please confirm your new password.';
    else if (newPw && newPw !== confirmPw) errs.confirmPw = 'Passwords do not match.';
    if (Object.keys(errs).length > 0) { setPwFieldErrors(errs); return; }
    setPwFieldErrors({});
    setPwSaving(true); setPwError('');
    try {
      await adminSettingsService.changePassword(currentPw, newPw);
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err?.response?.data?.detail ?? 'Failed to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  const pwField = (label: string, value: string, set: (v: string) => void, key: string, placeholder: string) => (
    <div className="mb-[10px]">
      <label className={LABEL}>{label}<span className="text-urgent ml-[2px]">*</span></label>
      <input
        type="password"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { set(e.target.value); setPwFieldErrors((p) => ({ ...p, [key]: '' })); setPwError(''); }}
        className={INPUT}
      />
      {pwFieldErrors[key] && <p className="text-[11px] text-urgent mt-[4px] font-medium">{pwFieldErrors[key]}</p>}
    </div>
  );

  return (
    <SuperAdminLayout>
      <div className="mb-4">
        <div className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">My Profile</div>
        <div className="text-[11.5px] text-slate">Your super admin account</div>
      </div>

      <div className="flex flex-col gap-4 max-w-[560px]">
        <Card title="Your Account">
          {loading ? <p className="text-[12px] text-slate">Loading…</p> : (
            <>
              <div className="mb-[13px]">
                <label className={LABEL}>Full Name</label>
                <input value={name} onChange={(e) => { setName(e.target.value); setNameError(''); }} className={INPUT} />
              </div>
              <div className="mb-[13px]">
                <label className={LABEL}>Email Address</label>
                <input value={email} disabled className={INPUT_DISABLED} />
              </div>
              <p className="text-[11px] text-slate mb-[13px] -mt-[8px]">Email cannot be changed here.</p>
              {nameError && <p className="text-[11px] text-urgent font-semibold mb-2">{nameError}</p>}
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
              >
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Account'}
              </button>
            </>
          )}
        </Card>

        <Card title="Change Password">
          {pwSuccess && (
            <div className="mb-3 px-3 py-[9px] bg-[#E3F5EC] border border-[#1F8A5F] rounded-[8px] text-[11.5px] text-[#1F8A5F] font-semibold">
              Password changed successfully.
            </div>
          )}
          {pwError && (
            <div className="mb-3 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
              {pwError}
            </div>
          )}
          {pwField('Current Password', currentPw, setCurrentPw, 'currentPw', 'Enter current password')}
          {pwField('New Password', newPw, setNewPw, 'newPw', 'Min. 8 chars, uppercase, number')}
          {pwField('Confirm New Password', confirmPw, setConfirmPw, 'confirmPw', 'Repeat new password')}
          <button
            onClick={handleChangePassword}
            disabled={pwSaving}
            className="mt-2 bg-navy text-white text-[12.5px] font-bold px-4 py-[10px] rounded-[9px] disabled:opacity-60"
          >
            {pwSaving ? 'Saving…' : 'Update Password'}
          </button>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
