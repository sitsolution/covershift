import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Panel from '../components/ui/Panel';
import FormField from '../components/ui/FormField';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import adminShiftsService, { AdminShiftDetail, ShiftFormOptions } from '../services/adminShiftsService';

// Simple select
function SelectField({
  label,
  required,
  options,
  labels,
  value,
  onChange,
  error,
}: {
  label: string;
  required?: boolean;
  options: string[];
  labels?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="mb-[13px]">
      <label className="block text-[11.5px] font-bold text-slate mb-[6px]">
        {label}{required && <span className="text-urgent ml-[2px]">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-[10px] border-[1.4px] rounded-[9px] text-[13px] text-ink bg-white outline-none focus:border-navy-2 appearance-none ${error ? 'border-urgent' : 'border-line'}`}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%235C6B7A' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
      >
        {options.map((o) => <option key={o || '__none'} value={o}>{o === '' ? '— None —' : (labels?.[o] ?? o)}</option>)}
      </select>
      {error && <p className="text-[11px] text-urgent mt-1">{error}</p>}
    </div>
  );
}

const SHIFT_TYPES = ['Regular', 'Emergency', 'Weekend', 'Night'];

const ROLE_OPTIONS = ['doctor', 'nurse', 'ot_tech', 'housekeeping'];
const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  ot_tech: 'OT Technician',
  housekeeping: 'Housekeeping',
};

// Specialties per role — sourced from the mobile signup screens
const ROLE_SPECIALTIES: Record<string, string[]> = {
  doctor: ['General Medicine', 'Emergency Medicine', 'Anaesthesia', 'Pediatrics'],
  nurse: ['ICU Nursing', 'General Ward', 'OT Nursing', 'Pediatric Nursing', 'Emergency Nursing'],
  ot_tech: ['General Ward', 'OT', 'ICU', 'Emergency'],
  housekeeping: ['General Ward', 'OT Housekeeping', 'Admin Block', 'ICU'],
};

const ROLE_QUALIFICATIONS: Record<string, string[]> = {
  doctor: ['MBBS', 'MD/MS', 'DNB'],
  nurse: ['GNM', 'B.Sc. Nursing', 'Post Basic B.Sc. Nursing'],
  ot_tech: ['Diploma in OT Technology', 'B.Sc. OT Technology', 'Allied Health Council'],
  housekeeping: [],
};

const ROLE_CERTIFICATIONS: Record<string, string[]> = {
  doctor: ['BLS', 'ACLS'],
  nurse: ['BLS', 'ACLS'],
  ot_tech: ['BLS'],
  housekeeping: [],
};

/** Today's date and the current time in the browser's local zone, in the
 *  YYYY-MM-DD / HH:MM shapes the date and time inputs use. toISOString() would
 *  give the UTC date, which is yesterday in IST until 5:30 AM. */
function localNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    nowTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Whole days from one YYYY-MM-DD date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local YYYY-MM-DD and HH:MM for an ISO timestamp, as the inputs take them. */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A select's options, plus the current value if an older shift used one the
 *  list no longer offers — otherwise the select would silently show another. */
function withValue(options: string[], value: string): string[] {
  return value && !options.includes(value) ? [...options, value] : options;
}

export default function CreateShift() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get('duplicate');
  const [duplicateOf, setDuplicateOf] = useState<AdminShiftDetail | null>(null);
  // Slots has no control on this form; a duplicate keeps the original's.
  const [slots, setSlots] = useState<number | undefined>(undefined);
  const [options, setOptions] = useState<ShiftFormOptions | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('doctor');
  const [facilityId, setFacilityId] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [shiftType, setShiftType] = useState('Regular');
  const [date, setDate] = useState('');        // start date
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [payRate, setPayRate] = useState('');
  const [overtimeRate, setOvertimeRate] = useState('');
  const [requiredQualification, setRequiredQualification] = useState('');
  const [requiredCertification, setRequiredCertification] = useState('');
  const [requirements, setRequirements] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [notifyStaff, setNotifyStaff] = useState(true);

  useEffect(() => {
    adminShiftsService.getFormOptions().then((opts) => {
      setOptions(opts);
      // A duplicate fills these from the original; don't race it with defaults.
      if (duplicateId) return;
      setSpecialty(ROLE_SPECIALTIES['doctor'][0]);
      if (opts.facilities.length > 0) setFacilityId(String(opts.facilities[0].id));
    }).catch(() => {});
  }, [duplicateId]);

  // Duplicate: copy every field from the original. The copy goes a week later,
  // like the old Duplicate button did; if that is already past, the dates are
  // left for the admin to pick.
  useEffect(() => {
    if (!duplicateId) return;
    adminShiftsService.getShift(parseInt(duplicateId)).then((s) => {
      setDuplicateOf(s);
      setTitle(s.title ?? '');
      setRole(s.role);
      setFacilityId(String(s.facilityId));
      setSpecialty(s.specialty);
      setShiftType(s.shiftType ?? (s.isUrgent ? 'Emergency' : 'Regular'));
      setStartTime(toTimeInput(s.startTime));
      setEndTime(toTimeInput(s.endTime));
      const week = 7 * 86_400_000;
      const start = new Date(new Date(s.startTime).getTime() + week);
      if (start > new Date()) {
        setDate(toDateInput(start.toISOString()));
        setEndDate(toDateInput(new Date(new Date(s.endTime).getTime() + week).toISOString()));
      }
      setPayRate(String(s.payRate));
      setOvertimeRate(s.overtimeRate ? String(s.overtimeRate) : '');
      setRequiredQualification(s.requiredQualifications[0] ?? '');
      setRequiredCertification(s.requiredCertifications[0] ?? '');
      setRequirements(s.requirements ?? '');
      setIsVisible(s.isVisible);
      setSlots(s.slots);
    }).catch(() => setError('Could not load the shift to duplicate.'));
  }, [duplicateId]);

  // Errors for the start/end window. Shared by Save and the live checks below:
  // the browser's time picker ignores `min`, so a past or inverted time is
  // flagged as soon as it is picked rather than waiting for Save.
  const windowErrors = (d: string, st: string, ed: string, et: string) => {
    const errs: Record<string, string> = {};
    const { today, nowTime } = localNow();
    if (d === today && st && st <= nowTime) errs.startTime = 'Start time must be later than now.';
    if (d && ed && ed < d) errs.endDate = 'End date cannot be before start date.';
    else if (d && st && ed && et) {
      const hours = (new Date(`${ed}T${et}`).getTime() - new Date(`${d}T${st}`).getTime()) / 3_600_000;
      if (hours <= 0) errs.endTime = 'End time must be after start time.';
      else if (hours > 24) errs.endTime = 'A shift cannot be longer than 24 hours.';
    }
    return errs;
  };

  const recheckWindow = (d: string, st: string, ed: string, et: string) =>
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n.startTime; delete n.endDate; delete n.endTime;
      return { ...n, ...windowErrors(d, st, ed, et) };
    });

  const changeStartDate = (value: string) => {
    // The end date moves with the start date, keeping its gap: same day for a
    // short shift, the next day for a night shift.
    const gapDays = date && endDate && endDate >= date ? daysBetween(date, endDate) : 0;
    const nextEnd = value ? addDays(value, gapDays) : '';
    setDate(value);
    setEndDate(nextEnd);
    clearFieldError('date');
    recheckWindow(value, startTime, nextEnd, endTime);
  };

  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const { today } = localNow();
    if (!date) errs.date = 'Start date is required.';
    else if (date < today) errs.date = 'Date cannot be in the past.';
    if (!endDate) errs.endDate = 'End date is required.';
    if (!startTime) errs.startTime = 'Start time is required.';
    if (!endTime) errs.endTime = 'End time is required.';
    Object.assign(errs, windowErrors(date, startTime, endDate, endTime));
    if (!payRate) errs.payRate = 'Pay rate is required.';
    else if (isNaN(parseFloat(payRate)) || parseFloat(payRate) <= 0) errs.payRate = 'Enter a valid pay rate.';
    if (overtimeRate && (isNaN(parseFloat(overtimeRate)) || parseFloat(overtimeRate) <= 0))
      errs.overtimeRate = 'Enter a valid overtime rate.';
    return errs;
  };

  const handleSave = async (publish: boolean) => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError('Please fix the highlighted fields below.');
      return;
    }
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const shift = await adminShiftsService.createShift({
        title: title || undefined,
        facilityId: facilityId ? parseInt(facilityId) : undefined,
        role,
        specialty,
        isUrgent: shiftType === 'Emergency',
        shiftType,
        date,
        endDate,
        startTime,
        endTime,
        payRate: parseFloat(payRate),
        slots,
        overtimeRate: overtimeRate ? parseFloat(overtimeRate) : undefined,
        requiredQualifications: requiredQualification ? [requiredQualification] : [],
        requiredCertifications: requiredCertification ? [requiredCertification] : [],
        requirements: requirements || undefined,
        isVisible,
        notifyStaff,
        publish,
      });
      navigate(`/shifts/${shift.id}`);
    } catch (err: unknown) {
      const data = (err as any)?.response?.data;
      const fields = data?.fields ?? {};
      if (Object.keys(fields).length > 0) {
        setFieldErrors(fields);
        setError('Please fix the highlighted fields below.');
      } else {
        setError(data?.detail ?? 'Failed to create shift.');
      }
    } finally {
      setSaving(false);
    }
  };

  const facilityOptions = options?.facilities ?? [];

  return (
    <Layout>
      <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">
        {duplicateId ? 'Duplicate Shift' : 'Create New Shift'}
      </h1>
      <p className="text-[11.5px] text-slate mb-4">
        {duplicateId
          ? `Copied from ${duplicateOf?.reference ?? '…'} — change anything you need, then save. Nothing is created until you save.`
          : 'Fill in the details below to publish a new shift'}
      </p>

      {error && (
        <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
          {error}
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        {/* Left column */}
        <div>
          <Panel title="Basic Information">
            <FormField label="Shift Title" placeholder="ER Night Cover" value={title} onChange={(e) => setTitle(e.target.value)} />

            {/* Location */}
            <div className="mb-[13px]">
              <label className="block text-[11.5px] font-bold text-slate mb-[6px]">Location</label>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full px-3 py-[10px] border-[1.4px] border-line rounded-[9px] text-[13px] text-ink bg-white outline-none focus:border-navy-2 appearance-none"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%235C6B7A' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                {facilityOptions.map((f) => (
                  <option key={f.id} value={String(f.id)}>{f.name}{f.location ? ` — ${f.location}` : ''}</option>
                ))}
              </select>
            </div>

            <SelectField
              label="Role Needed"
              required
              options={ROLE_OPTIONS}
              labels={ROLE_LABELS}
              value={role}
              onChange={(v) => {
                setRole(v);
                setSpecialty(ROLE_SPECIALTIES[v][0]);
                setRequiredQualification('');
                setRequiredCertification('');
                clearFieldError('specialty');
              }}
            />

            <SelectField
              label="Department / Specialty"
              required
              options={withValue(ROLE_SPECIALTIES[role], specialty)}
              value={specialty}
              onChange={(v) => { setSpecialty(v); clearFieldError('specialty'); }}
              error={fieldErrors.specialty}
            />

            <SelectField
              label="Shift Type"
              options={SHIFT_TYPES}
              value={shiftType}
              onChange={setShiftType}
            />
          </Panel>

          <Panel title="Date & Time">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Start Date"
                required
                type="date"
                min={localNow().today}
                value={date}
                error={fieldErrors.date}
                onChange={(e) => changeStartDate(e.target.value)}
              />
              <FormField
                label="Start Time"
                required
                type="time"
                min={date === localNow().today ? localNow().nowTime : undefined}
                value={startTime}
                error={fieldErrors.startTime}
                onChange={(e) => { setStartTime(e.target.value); recheckWindow(date, e.target.value, endDate, endTime); }}
              />
              <FormField
                label="End Date"
                required
                type="date"
                min={date || localNow().today}
                value={endDate}
                error={fieldErrors.endDate}
                onChange={(e) => { setEndDate(e.target.value); recheckWindow(date, startTime, e.target.value, endTime); }}
              />
              <FormField
                label="End Time"
                required
                type="time"
                value={endTime}
                error={fieldErrors.endTime}
                onChange={(e) => { setEndTime(e.target.value); recheckWindow(date, startTime, endDate, e.target.value); }}
              />
            </div>
          </Panel>

          <Panel title="Requirements">
            {ROLE_QUALIFICATIONS[role].length > 0 && (
              <SelectField
                label="Required Qualifications"
                options={withValue(['', ...ROLE_QUALIFICATIONS[role]], requiredQualification)}
                value={requiredQualification}
                onChange={setRequiredQualification}
              />
            )}
            {ROLE_CERTIFICATIONS[role].length > 0 && (
              <SelectField
                label="Required Certifications"
                options={withValue(['', ...ROLE_CERTIFICATIONS[role]], requiredCertification)}
                value={requiredCertification}
                onChange={setRequiredCertification}
              />
            )}
            {ROLE_QUALIFICATIONS[role].length === 0 && ROLE_CERTIFICATIONS[role].length === 0 && (
              <p className="text-[11.5px] text-slate mb-[13px]">No qualification or certification requirements for this role.</p>
            )}
            <FormField
              label="Additional Notes"
              placeholder="Must be comfortable with trauma cases"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
          </Panel>
        </div>

        {/* Right column */}
        <div>
          <Panel title="Compensation">
            <FormField
              label="Pay Rate (per shift)"
              required
              placeholder="9500"
              value={payRate}
              error={fieldErrors.payRate}
              onChange={(e) => { setPayRate(e.target.value); clearFieldError('payRate'); }}
            />
            <FormField
              label="Overtime Rate (per hour, optional)"
              placeholder="1200"
              value={overtimeRate}
              error={fieldErrors.overtimeRate}
              onChange={(e) => { setOvertimeRate(e.target.value); clearFieldError('overtimeRate'); }}
            />
          </Panel>

          <Panel title="Visibility">
            <ToggleSwitch label={`Make Visible to All ${ROLE_LABELS[role] ?? 'Staff'}s`} defaultOn={true} onChange={setIsVisible} />
            <ToggleSwitch label="Send Notifications" defaultOn={true} onChange={setNotifyStaff} />
          </Panel>

          <Panel>
            <button
              className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] mb-2 disabled:opacity-60"
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save & Publish'}
            </button>
            <button
              className="w-full bg-sky text-navy text-[13px] font-bold px-4 py-[11px] rounded-[10px] mb-2 disabled:opacity-60"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              Save as Draft
            </button>
            <button
              onClick={() => navigate(-1)}
              className="w-full bg-transparent text-slate text-[13px] font-semibold px-4 py-[11px] rounded-[10px]"
            >
              Cancel
            </button>
          </Panel>
        </div>
      </div>
    </Layout>
  );
}
