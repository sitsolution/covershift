import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Panel from '../components/ui/Panel';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import adminSettingsService, { FacilityProfileOut, AdminUserRow } from '../services/adminSettingsService';
import { useAuth } from '../store/auth';

const SUPPORT_EMAIL = 'info@covershift.app';

const NOTIFICATION_ITEMS: { key: 'pushNotifications' | 'smsAlerts' | 'emailAlerts'; label: string; desc: string }[] = [
  { key: 'pushNotifications', label: 'Push Notifications', desc: 'Browser and in-app alerts for new applications, bookings, and updates' },
  { key: 'smsAlerts',         label: 'SMS Alerts',         desc: 'Text message alerts for urgent shift confirmations and changes' },
  { key: 'emailAlerts',       label: 'Email Alerts',       desc: 'Email summaries and notifications sent to your account email' },
];

const SHIFT_DURATION_OPTIONS = ['4 hours', '6 hours', '8 hours', '10 hours', '12 hours'];
const BUFFER_TIME_OPTIONS    = ['No buffer', '30 minutes', '1 hour', '2 hours', '4 hours'];
const MAX_SHIFTS_OPTIONS     = ['No limit', '3 shifts', '5 shifts', '7 shifts', '10 shifts'];

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-[10px] pr-12 border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-[22px] w-[40px] flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${enabled ? 'bg-navy' : 'bg-line'}`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-0'}`}
      />
    </button>
  );
}

const NAV_ITEMS = [
  'Facility Profile',
  'Users & Permissions',
  'Shift Settings',
  'Notification Settings',
  'Integrations',
  'Security',
  'Help & Support',
];

export default function AdminSettings() {
  const { userId: currentUserId } = useAuth();
  const [activeNav, setActiveNav] = useState('Facility Profile');
  const [profile, setProfile] = useState<FacilityProfileOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Users tab
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AdminUserRow | null>(null);
  const [removeError, setRemoveError] = useState('');

  // Notification toggles — loaded from backend
  const [notifs, setNotifs] = useState({ pushNotifications: true, smsAlerts: true, emailAlerts: false });
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const toggleNotif = async (key: 'pushNotifications' | 'smsAlerts' | 'emailAlerts') => {
    const next = { ...notifs, [key]: !notifs[key] };
    setNotifs(next);
    try {
      await adminSettingsService.updateNotificationSettings({ [key]: next[key] });
    } catch {
      setNotifs(notifs); // revert on failure
    }
  };

  // Change password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwFieldErrors, setPwFieldErrors] = useState<Record<string, string>>({});
  const [pwSuccess, setPwSuccess] = useState(false);
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

  // Shift settings
  const [defaultDuration, setDefaultDuration] = useState('8 hours');
  const [bufferTime, setBufferTime] = useState('No buffer');
  const [maxShifts, setMaxShifts] = useState('No limit');

  // Copy email state
  const [copied, setCopied] = useState(false);
  const copyEmail = () => {
    navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Account (personal) fields
  const [acctName, setAcctName] = useState('');
  const [acctEmail, setAcctEmail] = useState('');
  const [acctPhone, setAcctPhone] = useState('');
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctSaved, setAcctSaved] = useState(false);
  const [acctError, setAcctError] = useState('');

  const handleSaveAccount = async () => {
    if (!acctName.trim() || acctName.trim().length < 3) {
      setAcctError('Full name must be at least 3 characters.'); return;
    }
    setAcctSaving(true); setAcctError(''); setAcctSaved(false);
    try {
      const updated = await adminSettingsService.updateMyProfile({ fullName: acctName.trim() });
      setAcctName(updated.fullName);
      setAcctSaved(true);
      setTimeout(() => setAcctSaved(false), 3000);
    } catch (err: any) {
      setAcctError(err?.response?.data?.detail ?? 'Failed to save account details.');
    } finally {
      setAcctSaving(false);
    }
  };

  // Facility editable fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    // Load facility and personal profile independently — one failing won't blank the other
    const [facilityResult, profileResult] = await Promise.allSettled([
      adminSettingsService.getFacility(),
      adminSettingsService.getMyProfile(),
    ]);
    if (facilityResult.status === 'fulfilled') {
      const p = facilityResult.value;
      setProfile(p);
      setName(p.name);
      setAddress(p.address ?? '');
      setContactEmail(p.contactEmail ?? '');
      setDescription(p.description ?? '');
    }
    if (profileResult.status === 'fulfilled') {
      const me = profileResult.value;
      setAcctName(me.fullName);
      setAcctEmail(me.email);
      setAcctPhone(me.phone ?? '');
    }
    setLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const list = await adminSettingsService.getUsers();
      setUsers(list);
    } catch {} finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeNav === 'Users & Permissions') loadUsers();
    if (activeNav === 'Notification Settings' && !notifsLoaded) {
      adminSettingsService.getNotificationSettings()
        .then(s => { setNotifs(s); setNotifsLoaded(true); })
        .catch(() => {});
    }
  }, [activeNav, loadUsers, notifsLoaded]);

  const handleRemoveConfirmed = async () => {
    if (!confirmRemove) return;
    setRemovingId(confirmRemove.memberId);
    setRemoveError('');
    try {
      await adminSettingsService.removeUser(confirmRemove.memberId);
      setUsers(prev => prev.filter(u => u.memberId !== confirmRemove.memberId));
      setConfirmRemove(null);
    } catch (err: any) {
      setRemoveError(err?.response?.data?.detail ?? 'Failed to remove user.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    setFieldErrors({});
    try {
      const updated = await adminSettingsService.updateFacility({ name, address, contactEmail, description });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      const resp = err?.response?.data;
      if (resp?.fields && typeof resp.fields === 'object') {
        setFieldErrors(resp.fields);
      } else if (resp?.detail) {
        setSaveError(resp.detail);
      } else {
        setSaveError('Failed to save changes. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-4">Settings</h1>

      <div className="grid gap-4" style={{ gridTemplateColumns: '200px 1fr' }}>
        {/* Left nav */}
        <Panel className="p-2">
          {NAV_ITEMS.map((item) => (
            <div
              key={item}
              onClick={() => setActiveNav(item)}
              className={`px-[10px] py-[9px] rounded-[8px] text-[12px] font-semibold cursor-pointer mb-[2px] last:mb-0 ${
                activeNav === item ? 'bg-navy text-white' : 'text-slate hover:bg-paper'
              }`}
            >
              {item}
            </div>
          ))}
        </Panel>

        {/* Right content */}
        {activeNav === 'Facility Profile' && (
          <div className="flex flex-col gap-4">
            {/* Your Account */}
            <Panel title="Your Account">
              {loading ? <p className="text-[12px] text-slate">Loading…</p> : (
                <>
                  <div className="mb-[13px]">
                    <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Full Name</label>
                    <input
                      value={acctName}
                      onChange={(e) => { setAcctName(e.target.value); setAcctError(''); }}
                      className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-[10px] mb-[13px]">
                    <div>
                      <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Email Address</label>
                      <input
                        value={acctEmail}
                        disabled
                        className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-slate bg-paper cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Phone Number</label>
                      <input
                        value={acctPhone}
                        disabled
                        className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-slate bg-paper cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate mb-[13px] -mt-[8px]">Email and phone cannot be changed. Contact support if needed.</p>
                  {acctError && <p className="text-[11px] text-urgent font-semibold mb-2">{acctError}</p>}
                  <button
                    onClick={handleSaveAccount}
                    disabled={acctSaving}
                    className="bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
                  >
                    {acctSaving ? 'Saving…' : acctSaved ? 'Saved ✓' : 'Save Account'}
                  </button>
                </>
              )}
            </Panel>

            {/* Facility Details */}
            <Panel title="Facility Details">
              {loading ? <p className="text-[12px] text-slate">Loading…</p> : (
                <>
                  <div className="mb-[13px]">
                    <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Facility Name</label>
                    <input
                      value={name}
                      onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: '' })); }}
                      className={`w-full px-3 py-[11px] border-[1.4px] rounded-[9px] text-[13px] text-ink outline-none bg-white ${fieldErrors.name ? 'border-urgent focus:border-urgent' : 'border-line focus:border-navy-2'}`}
                    />
                    {fieldErrors.name && <p className="text-[11px] text-urgent mt-1">{fieldErrors.name}</p>}
                  </div>
                  <div className="mb-[13px]">
                    <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Address</label>
                    <input
                      value={address}
                      onChange={(e) => { setAddress(e.target.value); setFieldErrors(p => ({ ...p, address: '' })); }}
                      className={`w-full px-3 py-[11px] border-[1.4px] rounded-[9px] text-[13px] text-ink outline-none bg-white ${fieldErrors.address ? 'border-urgent focus:border-urgent' : 'border-line focus:border-navy-2'}`}
                    />
                    {fieldErrors.address && <p className="text-[11px] text-urgent mt-1">{fieldErrors.address}</p>}
                  </div>
                  <div className="mb-[13px]">
                    <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Contact Email</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => { setContactEmail(e.target.value); setFieldErrors(p => ({ ...p, contactEmail: '' })); }}
                      className={`w-full px-3 py-[11px] border-[1.4px] rounded-[9px] text-[13px] text-ink outline-none bg-white ${fieldErrors.contactEmail ? 'border-urgent focus:border-urgent' : 'border-line focus:border-navy-2'}`}
                    />
                    {fieldErrors.contactEmail && <p className="text-[11px] text-urgent mt-1">{fieldErrors.contactEmail}</p>}
                  </div>
                  <div className="mb-[13px]">
                    <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Description</label>
                    <input
                      value={description}
                      onChange={(e) => { setDescription(e.target.value); setFieldErrors(p => ({ ...p, description: '' })); }}
                      className={`w-full px-3 py-[11px] border-[1.4px] rounded-[9px] text-[13px] text-ink outline-none bg-white ${fieldErrors.description ? 'border-urgent focus:border-urgent' : 'border-line focus:border-navy-2'}`}
                    />
                    {fieldErrors.description && <p className="text-[11px] text-urgent mt-1">{fieldErrors.description}</p>}
                  </div>
                  {saveError && <p className="text-[11px] text-urgent font-semibold mb-2">{saveError}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
                    >
                      {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Facility'}
                    </button>
                    <Link
                      to="/settings/add-user"
                      className="bg-transparent border border-navy text-navy text-[12px] font-bold px-3 py-[10px] rounded-[10px]"
                    >
                      + Add Admin User
                    </Link>
                  </div>
                  {profile && (
                    <p className="text-[11px] text-slate mt-3">
                      {profile.city}{profile.state ? `, ${profile.state}` : ''} · Rating: {profile.rating.toFixed(1)}★
                    </p>
                  )}
                </>
              )}
            </Panel>
          </div>
        )}

        {activeNav === 'Users & Permissions' && (
          <Panel title="Users & Permissions">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[12px] text-slate">Admin users for your facility.</p>
              {users.find(u => u.id === currentUserId)?.facilityRole === 'super_admin' && (
                <Link
                  to="/settings/add-user"
                  className="bg-navy text-white text-[11.5px] font-bold px-3 py-[7px] rounded-[8px]"
                >
                  + Invite Admin User
                </Link>
              )}
            </div>
            {usersLoading ? (
              <p className="text-[12px] text-slate">Loading…</p>
            ) : users.length === 0 ? (
              <p className="text-[12px] text-slate text-center py-4">No admin users found.</p>
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-line">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.name}</td>
                        <td className="text-slate">{u.email}</td>
                        <td>
                          <Badge
                            label={u.facilityRole === 'super_admin' ? 'Super Admin' : u.facilityRole === 'staff' ? 'Staff' : 'Manager'}
                            variant={u.facilityRole === 'super_admin' ? 'info' : 'neutral'}
                          />
                        </td>
                        <td>
                          <Badge
                            label={u.acceptedAt ? 'Active' : 'Invited'}
                            variant={u.acceptedAt ? 'success' : 'warning'}
                          />
                        </td>
                        <td className="text-[12px]">
                          {u.id !== currentUserId && u.facilityRole !== 'super_admin' && (
                            <span
                              onClick={() => { setConfirmRemove(u); setRemoveError(''); }}
                              className="text-urgent font-semibold cursor-pointer hover:underline"
                            >
                              Remove
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {activeNav === 'Notification Settings' && (
          <Panel title="Notification Settings">
            <p className="text-[12px] text-slate mb-4">Choose how you want to receive notifications.</p>
            {!notifsLoaded ? (
              <p className="text-[12px] text-slate">Loading…</p>
            ) : (
              <div>
                {NOTIFICATION_ITEMS.map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-[13px] border-b border-line last:border-0">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">{item.label}</p>
                      <p className="text-[11.5px] text-slate mt-[2px]">{item.desc}</p>
                    </div>
                    <Toggle enabled={notifs[item.key]} onToggle={() => toggleNotif(item.key)} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {activeNav === 'Shift Settings' && (
          <Panel title="Shift Settings">
            <p className="text-[12px] text-slate mb-4">Default values applied when creating new shifts. You can override these per shift.</p>
            <div className="mb-[13px]">
              <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Default Shift Duration</label>
              <select
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(e.target.value)}
                className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white appearance-none"
              >
                {SHIFT_DURATION_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="mb-[13px]">
              <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Buffer Time Between Shifts</label>
              <select
                value={bufferTime}
                onChange={(e) => setBufferTime(e.target.value)}
                className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white appearance-none"
              >
                {BUFFER_TIME_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
              <p className="text-[11px] text-slate mt-[5px]">Minimum gap required between consecutive shifts for the same staff member.</p>
            </div>
            <div className="mb-[18px]">
              <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Max Shifts Per Staff Per Week</label>
              <select
                value={maxShifts}
                onChange={(e) => setMaxShifts(e.target.value)}
                className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white appearance-none"
              >
                {MAX_SHIFTS_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-[10px] bg-[#F0F4FA] rounded-[8px]">
              <span className="text-[13px]">ℹ️</span>
              <p className="text-[11.5px] text-slate">Full shift rules configuration coming in the next update.</p>
            </div>
          </Panel>
        )}

        {activeNav === 'Integrations' && (
          <Panel title="Integrations">
            <p className="text-[12px] text-slate mb-4">Connect Covershift with your existing tools.</p>

            {/* Export */}
            <div className="border border-line rounded-[10px] p-4 mb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-bold text-ink mb-[3px]">Export Data (CSV)</p>
                  <p className="text-[11.5px] text-slate">Download your shifts, bookings, or staff list as a spreadsheet.</p>
                </div>
                <a
                  href="/reports"
                  className="text-[11.5px] font-bold text-navy-2 border border-navy-2 px-3 py-[6px] rounded-[7px] hover:bg-navy hover:text-white transition-colors whitespace-nowrap ml-4"
                >
                  Go to Reports
                </a>
              </div>
            </div>

            {/* Calendar */}
            <div className="border border-line rounded-[10px] p-4 mb-3 opacity-60">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-bold text-ink mb-[3px]">Calendar Sync</p>
                  <p className="text-[11.5px] text-slate">Sync confirmed shifts with Google Calendar or Outlook.</p>
                </div>
                <span className="text-[11px] font-semibold text-slate border border-line px-2 py-[5px] rounded-[6px] whitespace-nowrap ml-4">Coming Soon</span>
              </div>
            </div>

            {/* Payroll */}
            <div className="border border-line rounded-[10px] p-4 opacity-60">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-bold text-ink mb-[3px]">Payroll Export</p>
                  <p className="text-[11.5px] text-slate">Export completed shift hours to your payroll provider.</p>
                </div>
                <span className="text-[11px] font-semibold text-slate border border-line px-2 py-[5px] rounded-[6px] whitespace-nowrap ml-4">Coming Soon</span>
              </div>
            </div>
          </Panel>
        )}

        {activeNav === 'Security' && (
          <Panel title="Security">
            <p className="text-[12px] text-slate mb-4">Manage access and account security settings.</p>

            {/* Change Password — inline form */}
            <div className="border border-line rounded-[10px] p-4 mb-3">
              <p className="text-[13px] font-bold text-ink mb-[3px]">Change Password</p>
              <p className="text-[11.5px] text-slate mb-4">Update your account password regularly to keep your account safe.</p>
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
              <div className="mb-[10px]">
                <label className="block text-[11.5px] font-bold text-slate mb-[5px]">Current Password<span className="text-urgent ml-[2px]">*</span></label>
                <PasswordInput value={currentPw} onChange={(v) => { setCurrentPw(v); setPwFieldErrors(p => ({ ...p, currentPw: '' })); setPwError(''); }} placeholder="Enter current password" />
                {pwFieldErrors.currentPw && <p className="text-[11px] text-urgent mt-[4px] font-medium">{pwFieldErrors.currentPw}</p>}
              </div>
              <div className="mb-[10px]">
                <label className="block text-[11.5px] font-bold text-slate mb-[5px]">New Password<span className="text-urgent ml-[2px]">*</span></label>
                <PasswordInput value={newPw} onChange={(v) => { setNewPw(v); setPwFieldErrors(p => ({ ...p, newPw: '' })); setPwError(''); }} placeholder="Min. 8 chars, uppercase, number" />
                {pwFieldErrors.newPw && <p className="text-[11px] text-urgent mt-[4px] font-medium">{pwFieldErrors.newPw}</p>}
              </div>
              <div className="mb-4">
                <label className="block text-[11.5px] font-bold text-slate mb-[5px]">Confirm New Password<span className="text-urgent ml-[2px]">*</span></label>
                <PasswordInput value={confirmPw} onChange={(v) => { setConfirmPw(v); setPwFieldErrors(p => ({ ...p, confirmPw: '' })); setPwError(''); }} placeholder="Repeat new password" />
                {pwFieldErrors.confirmPw && <p className="text-[11px] text-urgent mt-[4px] font-medium">{pwFieldErrors.confirmPw}</p>}
              </div>
              <button
                onClick={handleChangePassword}
                disabled={pwSaving}
                className="bg-navy text-white text-[12.5px] font-bold px-4 py-[10px] rounded-[9px] disabled:opacity-60"
              >
                {pwSaving ? 'Saving…' : 'Update Password'}
              </button>
            </div>

            {/* 2FA */}
            <div className="border border-line rounded-[10px] p-4 mb-3 opacity-60">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-bold text-ink mb-[3px]">Two-Factor Authentication</p>
                  <p className="text-[11.5px] text-slate">Add an extra layer of security with an authenticator app or SMS code.</p>
                </div>
                <span className="text-[11px] font-semibold text-slate border border-line px-2 py-[5px] rounded-[6px] whitespace-nowrap ml-4">Coming Soon</span>
              </div>
            </div>

            {/* Session timeout */}
            <div className="border border-line rounded-[10px] p-4 opacity-60">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-bold text-ink mb-[3px]">Session Timeout</p>
                  <p className="text-[11.5px] text-slate">Automatically log out after a period of inactivity.</p>
                </div>
                <span className="text-[11px] font-semibold text-slate border border-line px-2 py-[5px] rounded-[6px] whitespace-nowrap ml-4">Coming Soon</span>
              </div>
            </div>
          </Panel>
        )}

        {activeNav === 'Help & Support' && (
          <Panel title="Help & Support">
            <p className="text-[12px] text-slate mb-5">Need help? Reach out to the Covershift support team.</p>

            {/* Email card */}
            <div className="border border-line rounded-[10px] p-4 mb-4">
              <p className="text-[11.5px] font-bold text-slate mb-[6px]">Support Email</p>
              <div className="flex items-center gap-3">
                <p className="text-[14px] font-bold text-ink">{SUPPORT_EMAIL}</p>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="text-[11px] font-semibold text-navy-2 border border-navy-2 px-2 py-[5px] rounded-[6px] hover:bg-navy hover:text-white transition-colors"
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-[11px] font-semibold text-white bg-navy px-2 py-[5px] rounded-[6px] hover:bg-navy-2 transition-colors"
                >
                  Send Email
                </a>
              </div>
              <p className="text-[11.5px] text-slate mt-[8px]">Our team typically responds within 1 business day.</p>
            </div>

            {/* Response hours */}
            <div className="flex items-center gap-2 px-3 py-[10px] bg-[#F0F4FA] rounded-[8px]">
              <span className="text-[13px]">🕐</span>
              <p className="text-[11.5px] text-slate">Support hours: Monday – Friday, 9:00 AM – 6:00 PM IST</p>
            </div>
          </Panel>
        )}
      </div>

      {confirmRemove && (
        <Modal
          title="Remove admin user?"
          message={`${confirmRemove.name} will lose access to this facility immediately.${removeError ? `\n\nError: ${removeError}` : ''}`}
          confirmLabel="Remove"
          confirmVariant="danger"
          loading={removingId === confirmRemove.memberId}
          onConfirm={handleRemoveConfirmed}
          onCancel={() => { setConfirmRemove(null); setRemoveError(''); }}
        />
      )}
    </Layout>
  );
}
