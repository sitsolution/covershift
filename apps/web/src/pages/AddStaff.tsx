import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Panel from '../components/ui/Panel';
import adminStaffService from '../services/adminStaffService';

const ROLES = [
  { value: 'doctor',      label: 'Doctor' },
  { value: 'nurse',       label: 'Nurse' },
  { value: 'ot_tech',     label: 'OT Technician' },
  { value: 'housekeeping', label: 'Housekeeping' },
];

const EXPERIENCE_OPTIONS = ['0–2 years', '3–5 years', '6–10 years', '10+ years'];

const ROLE_META: Record<string, {
  credentialLabel: string;
  credentialPlaceholder: string;
  specialtyLabel: string;
  specialtyOptions: string[];
}> = {
  doctor: {
    credentialLabel: 'Medical License Number',
    credentialPlaceholder: 'MCI-2019-88213',
    specialtyLabel: 'Specialty',
    specialtyOptions: ['General Medicine', 'Emergency Medicine', 'Anaesthesia', 'Pediatrics'],
  },
  nurse: {
    credentialLabel: 'Nursing Registration Number',
    credentialPlaceholder: 'MNC-2021-44210',
    specialtyLabel: 'Specialty',
    specialtyOptions: ['ICU Nursing', 'General Ward', 'OT Nursing', 'Pediatric Nursing', 'Emergency Nursing'],
  },
  ot_tech: {
    credentialLabel: 'Certificate Number',
    credentialPlaceholder: 'OTA-2020-1187',
    specialtyLabel: 'Certifying Body',
    specialtyOptions: ['Diploma in OT Technology', 'B.Sc. OT Technology', 'Allied Health Council'],
  },
  housekeeping: {
    credentialLabel: 'Aadhaar / ID Proof Number',
    credentialPlaceholder: 'XXXX XXXX XXXX',
    specialtyLabel: 'Work Area',
    specialtyOptions: ['General Ward', 'OT Housekeeping', 'Admin Block', 'ICU'],
  },
};

const INPUT = (err?: string) =>
  `w-full px-3 py-[11px] border-[1.4px] ${err ? 'border-urgent' : 'border-line'} rounded-[9px] text-[13px] text-ink outline-none focus:border-navy-2 bg-white`;
const LABEL = 'block text-[11.5px] font-bold text-slate mb-[6px]';
const FIELD = 'mb-[13px]';
const REQ = <span className="text-urgent ml-[2px]">*</span>;
const FieldError = ({ msg }: { msg?: string }) =>
  msg ? <p className="text-[11px] text-urgent mt-[4px] font-medium">{msg}</p> : null;

export default function AddStaff() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('doctor');
  const [credentialNumber, setCredentialNumber] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [experience, setExperience] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const meta = ROLE_META[role];

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    setCredentialNumber('');
    setSpecialty('');
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 3) errs.fullName = 'Full name must be at least 3 characters.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!phone.trim()) errs.phone = 'Phone number is required.';
    else if (!/^\+?[0-9 \-]{10,20}$/.test(phone.trim())) errs.phone = 'Enter a valid phone number (10–15 digits).';
    if (!password) errs.password = 'Temporary password is required.';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    else if (!/[A-Z]/.test(password)) errs.password = 'Password must contain at least one uppercase letter.';
    else if (!/[a-z]/.test(password)) errs.password = 'Password must contain at least one lowercase letter.';
    else if (!/[0-9]/.test(password)) errs.password = 'Password must contain at least one number.';
    return errs;
  };

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setFieldErrors({});
    setSubmitting(true);
    setError('');
    try {
      await adminStaffService.createStaff({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role,
        password,
        credentialNumber: credentialNumber.trim() || undefined,
        specialty: specialty || undefined,
        experience: experience || undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate('/staff'), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to create staff account.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">Add Staff Member</h1>
      <p className="text-[11.5px] text-slate mb-4">
        Create a staff account manually. The account will be <strong>Unverified</strong> until the staff member logs in and completes OTP verification on the mobile app.
      </p>

      {error && (
        <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-3 py-[9px] bg-[#E3F5EC] border border-[#1F8A5F] rounded-[8px] text-[11.5px] text-[#1F8A5F] font-semibold">
          Staff account created successfully! Redirecting to Staff Database…
        </div>
      )}

      <Panel className="max-w-[540px]">
        {/* Role selector — first so credential fields update */}
        <div className={FIELD}>
          <label className={LABEL}>Role</label>
          <div className="grid grid-cols-2 gap-[8px]">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => handleRoleChange(r.value)}
                className={[
                  'px-3 py-[10px] rounded-[9px] text-[12.5px] font-semibold border-[1.4px] transition-colors text-left',
                  role === r.value
                    ? 'border-navy-2 bg-navy text-white'
                    : 'border-line bg-white text-ink hover:border-navy-2',
                ].join(' ')}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Basic info */}
        <div className={FIELD}>
          <label className={LABEL}>Full Name{REQ}</label>
          <input
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); clearFieldError('fullName'); }}
            placeholder="Dr. Arjun Mehta"
            className={INPUT(fieldErrors.fullName)}
          />
          <FieldError msg={fieldErrors.fullName} />
        </div>

        <div className="grid grid-cols-2 gap-[10px] mb-[13px]">
          <div>
            <label className={LABEL}>Email Address{REQ}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
              placeholder="arjun@example.com"
              className={INPUT(fieldErrors.email)}
            />
            <FieldError msg={fieldErrors.email} />
          </div>
          <div>
            <label className={LABEL}>Phone Number{REQ}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }}
              placeholder="+91 98765 43210"
              className={INPUT(fieldErrors.phone)}
            />
            <FieldError msg={fieldErrors.phone} />
          </div>
        </div>

        {/* Role-specific credential */}
        <div className={FIELD}>
          <label className={LABEL}>{meta.credentialLabel}</label>
          <input
            value={credentialNumber}
            onChange={(e) => setCredentialNumber(e.target.value)}
            placeholder={meta.credentialPlaceholder}
            className={INPUT()}
          />
        </div>

        <div className="grid grid-cols-2 gap-[10px] mb-[13px]">
          <div>
            <label className={LABEL}>{meta.specialtyLabel}</label>
            <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={INPUT() + ' appearance-none'}>
              <option value="">Select…</option>
              {meta.specialtyOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Experience</label>
            <select value={experience} onChange={(e) => setExperience(e.target.value)} className={INPUT() + ' appearance-none'}>
              <option value="">Select…</option>
              {EXPERIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* Temporary password */}
        <div className={FIELD}>
          <label className={LABEL}>Temporary Password{REQ}</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
              placeholder="Min. 8 chars, uppercase, number"
              className={INPUT(fieldErrors.password) + ' pr-16'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate hover:text-ink"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <FieldError msg={fieldErrors.password} />
          <p className="text-[11px] text-slate mt-[5px]">
            Share this with the staff member. They can change it after logging in on the mobile app.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-[10px] mt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 bg-transparent text-slate text-[13px] font-semibold px-4 py-[11px] rounded-[10px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || success}
            className="flex-1 bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Staff Account'}
          </button>
        </div>
      </Panel>
    </Layout>
  );
}
