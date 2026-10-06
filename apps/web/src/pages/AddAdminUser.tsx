import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Panel from '../components/ui/Panel';
import adminSettingsService, { PermissionOption } from '../services/adminSettingsService';

export default function AddAdminUser() {
  const navigate = useNavigate();
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [facilityRole, setFacilityRole] = useState('manager');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    adminSettingsService.getPermissions().then((opts) => {
      setPermissions(opts);
      // Default: check all except billing
      setChecked(new Set(opts.map(o => o.value)));
    }).catch(() => {
      // Fallback
      const fallback: PermissionOption[] = [
        { value: 'shifts', label: 'Shifts' },
        { value: 'staff', label: 'Staff' },
        { value: 'bookings', label: 'Bookings' },
        { value: 'documents', label: 'Documents' },
        { value: 'reports', label: 'Reports' },
        { value: 'activity_log', label: 'Activity Log' },
      ];
      setPermissions(fallback);
      setChecked(new Set(fallback.map(o => o.value)));
    });
  }, []);

  const toggle = (value: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required.';
    if (!email.trim()) errs.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSubmitting(true);
    setError('');
    try {
      await adminSettingsService.inviteUser({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        facilityRole,
        permissions: Array.from(checked),
      });
      setSuccess(true);
      setTimeout(() => navigate('/settings'), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to send invitation.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">Add Team Member</h1>
      <p className="text-[11.5px] text-slate mb-4">Invite a new admin user to your facility</p>

      {error && (
        <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-3 py-[9px] bg-[#E3F5EC] border border-[#1F8A5F] rounded-[8px] text-[11.5px] text-[#1F8A5F] font-semibold">
          Invitation sent successfully! Redirecting…
        </div>
      )}

      <Panel className="max-w-[520px]">
        <div className="mb-[13px]">
          <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Full Name<span className="text-urgent ml-[2px]">*</span></label>
          <input
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setFieldErrors(p => ({ ...p, fullName: '' })); }}
            placeholder="Rohan Deshpande"
            className={`w-full px-3 py-[11px] border-[1.4px] ${fieldErrors.fullName ? 'border-urgent' : 'border-line'} rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white`}
          />
          {fieldErrors.fullName && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.fullName}</p>}
        </div>
        <div className="mb-[13px]">
          <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Email Address<span className="text-urgent ml-[2px]">*</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }}
            placeholder="rohan@stjosephhosp.in"
            className={`w-full px-3 py-[11px] border-[1.4px] ${fieldErrors.email ? 'border-urgent' : 'border-line'} rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white`}
          />
          {fieldErrors.email && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.email}</p>}
        </div>
        <div className="mb-[13px]">
          <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Role</label>
          <select
            value={facilityRole}
            onChange={(e) => setFacilityRole(e.target.value)}
            className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white appearance-none"
          >
            <option value="super_admin">Super Admin</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <div className="mb-[13px]">
          <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Phone Number (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98xxxxxx77"
            className="w-full px-3 py-[11px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white"
          />
        </div>

        {/* Permissions */}
        <p className="text-[13px] font-extrabold font-display text-ink mt-[6px] mb-[10px]">Permissions</p>
        {permissions.map((perm) => (
          <label key={perm.value} className="flex items-center gap-2 text-[12px] py-[5px] cursor-pointer">
            <input
              type="checkbox"
              checked={checked.has(perm.value)}
              onChange={() => toggle(perm.value)}
              className="w-4 h-4 accent-navy"
            />
            {perm.label}
          </label>
        ))}

        {/* Buttons */}
        <div className="flex gap-[10px] mt-4">
          <button
            onClick={() => navigate(-1)}
            className="flex-1 bg-transparent text-slate text-[13px] font-semibold px-4 py-[11px] rounded-[10px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send Invitation'}
          </button>
        </div>
      </Panel>
    </Layout>
  );
}
