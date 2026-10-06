import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import Panel from '../../components/ui/Panel';
import Badge from '../../components/ui/Badge';
import superAdminService, { SAFacility } from '../../services/superAdminService';
import SortTh from '../../components/ui/SortTh';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { label: 'All Types',         value: ''                  },
  { label: 'Hospital',          value: 'hospital'          },
  { label: 'Clinic',            value: 'clinic'            },
  { label: 'Diagnostic Centre', value: 'diagnostic_centre' },
  { label: 'Staffing Agency',   value: 'staffing_agency'   },
];

function facilityTypeLabel(t: string): string {
  const match = TYPE_OPTIONS.find((o) => o.value === t);
  return match?.label ?? t;
}

// ─── Add Facility Modal ───────────────────────────────────────────────────────

interface AddModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const inputCls = 'w-full px-3 py-[10px] border-[1.4px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-navy-2 bg-white';
const labelCls = 'block text-[11.5px] font-bold text-slate mb-[6px]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function AddFacilityModal({ onClose, onCreated }: AddModalProps) {
  const [name, setName]                   = useState('');
  const [facilityType, setFacilityType]   = useState('hospital');
  const [city, setCity]                   = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail]       = useState('');
  const [adminPhone, setAdminPhone]       = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [fieldErrors, setFieldErrors]     = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Facility name is required.';
    if (!city.trim()) errs.city = 'City is required.';
    if (!adminFullName.trim()) errs.adminFullName = 'Admin full name is required.';
    if (!adminEmail.trim()) errs.adminEmail = 'Admin email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) errs.adminEmail = 'Enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters.';
    if (!confirmPassword) errs.confirmPassword = 'Please confirm the password.';
    else if (password && password !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    setError('');
    try {
      await superAdminService.createFacility({
        name, facilityType, city,
        adminFullName, adminEmail,
        adminPhone: adminPhone || undefined,
        adminPassword: password,
      });
      onCreated();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to create facility.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(8,28,44,0.55)' }}>
      <div className="bg-white rounded-[14px] border border-line w-full max-w-[480px] shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-line flex-shrink-0">
          <span className="font-display font-extrabold text-[15px] text-ink">Add Facility</span>
          <button onClick={onClose} className="text-slate hover:text-ink text-[20px] leading-none bg-transparent outline-none cursor-pointer">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {error && (
            <div className="px-3 py-[8px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
              {error}
            </div>
          )}

          {/* Section: Facility Details */}
          <div>
            <p className="text-[10.5px] font-bold text-slate uppercase tracking-wider mb-3">Facility Details</p>
            <div className="flex flex-col gap-[13px]">
              <div>
                <label className={labelCls}>Hospital / Clinic Name<span className="text-urgent ml-[2px]">*</span></label>
                <input type="text" value={name} onChange={(e) => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: '' })); }}
                  placeholder="e.g. Apollo Hospital Mumbai" className={`${inputCls} ${fieldErrors.name ? 'border-urgent' : ''}`} />
                {fieldErrors.name && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.name}</p>}
              </div>
              <Field label="Facility Type">
                <select value={facilityType} onChange={(e) => setFacilityType(e.target.value)} className={inputCls + ' cursor-pointer'}>
                  {TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div>
                <label className={labelCls}>City / Location<span className="text-urgent ml-[2px]">*</span></label>
                <input type="text" value={city} onChange={(e) => { setCity(e.target.value); setFieldErrors(p => ({ ...p, city: '' })); }}
                  placeholder="e.g. Mumbai, Maharashtra" className={`${inputCls} ${fieldErrors.city ? 'border-urgent' : ''}`} />
                {fieldErrors.city && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.city}</p>}
              </div>
            </div>
          </div>

          <div className="border-t border-line" />

          {/* Section: Admin Account */}
          <div>
            <p className="text-[10.5px] font-bold text-slate uppercase tracking-wider mb-3">Admin Account</p>
            <div className="flex flex-col gap-[13px]">
              <div>
                <label className={labelCls}>Full Name<span className="text-urgent ml-[2px]">*</span></label>
                <input type="text" value={adminFullName} onChange={(e) => { setAdminFullName(e.target.value); setFieldErrors(p => ({ ...p, adminFullName: '' })); }}
                  placeholder="Admin Name" className={`${inputCls} ${fieldErrors.adminFullName ? 'border-urgent' : ''}`} />
                {fieldErrors.adminFullName && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.adminFullName}</p>}
              </div>
              <div>
                <label className={labelCls}>Email Address<span className="text-urgent ml-[2px]">*</span></label>
                <input type="email" value={adminEmail} onChange={(e) => { setAdminEmail(e.target.value); setFieldErrors(p => ({ ...p, adminEmail: '' })); }}
                  placeholder="admin@hospital.com" className={`${inputCls} ${fieldErrors.adminEmail ? 'border-urgent' : ''}`} />
                {fieldErrors.adminEmail && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.adminEmail}</p>}
              </div>
              <Field label="Phone Number">
                <input type="tel" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="+91 9876543210" className={inputCls} />
              </Field>
              <div>
                <label className={labelCls}>Password<span className="text-urgent ml-[2px]">*</span></label>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                    placeholder="Create password" className={`${inputCls} pr-10 ${fieldErrors.password ? 'border-urgent' : ''}`} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink" tabIndex={-1}>
                    {showPwd
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {fieldErrors.password && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.password}</p>}
              </div>
              <div>
                <label className={labelCls}>Confirm Password<span className="text-urgent ml-[2px]">*</span></label>
                <input type={showPwd ? 'text' : 'password'} value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                  placeholder="Repeat password" className={`${inputCls} ${fieldErrors.confirmPassword ? 'border-urgent' : ''}`} />
                {fieldErrors.confirmPassword && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.confirmPassword}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-line flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 bg-white text-slate border border-line text-[12.5px] font-bold px-4 py-[10px] rounded-[9px] hover:border-navy transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 bg-navy text-white text-[12.5px] font-bold px-4 py-[10px] rounded-[9px] disabled:opacity-60 hover:bg-navy-2 transition-colors">
            {saving ? 'Creating…' : 'Create Facility'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SAFacilities() {
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState<SAFacility[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [sortBy, setSortBy]         = useState('created_at');
  const [sortOrder, setSortOrder]   = useState<'asc' | 'desc'>('desc');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  const fetchFacilities = () => {
    setLoading(true);
    setError('');
    const params: Record<string, unknown> = { sortBy, sortOrder };
    if (search)     params.search = search;
    if (typeFilter) params.facility_type = typeFilter;
    if (cityFilter) params.city = cityFilter;
    superAdminService
      .getFacilities(params)
      .then((res) => {
        setFacilities(res.items);
        setTotal(res.total);
      })
      .catch(() => setError('Failed to load facilities.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFacilities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, cityFilter, sortBy, sortOrder]);

  const handleCreated = () => {
    setShowModal(false);
    fetchFacilities();
  };

  const handleToggleStatus = async (f: SAFacility) => {
    setTogglingId(f.id);
    try {
      await superAdminService.updateFacility(f.id, { isActive: !f.isActive });
      setFacilities((prev) => prev.map((x) => x.id === f.id ? { ...x, isActive: !f.isActive } : x));
    } catch {
      setError('Failed to update facility status.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <SuperAdminLayout>
      {showModal && (
        <AddFacilityModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">
            Facilities
          </div>
          <div className="text-[11.5px] text-slate">
            {total.toLocaleString()} facilities on Covershift
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-navy text-white text-[12px] font-bold px-4 py-[9px] rounded-[9px] hover:bg-navy-2 transition-colors"
        >
          + Add Facility
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-[14px]">
        <div className="flex items-center bg-white border border-line rounded-[8px] px-3 py-[8px] gap-2 flex-1 max-w-[280px]">
          <span className="text-[12px]">🔍</span>
          <input
            type="text"
            placeholder="Search facilities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[12px] text-ink outline-none bg-transparent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white border border-line rounded-[8px] px-3 py-[8px] text-[12px] text-ink outline-none cursor-pointer"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="City ▾"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="bg-white border border-line rounded-[8px] px-3 py-[8px] text-[12px] text-ink outline-none w-[120px]"
        />
      </div>

      {/* Table */}
      <Panel>
        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="adm-table">
            <thead>
              <tr>
                <SortTh label="Facility" column="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th>Type</th>
                <SortTh label="City" column="city" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th>Admin Contact</th>
                <th>Staff Count</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate py-10">Loading…</td>
                </tr>
              ) : facilities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate py-10">No facilities found.</td>
                </tr>
              ) : (
                facilities.map((f) => (
                  <tr key={f.id}>
                    <td className="font-semibold">{f.name}</td>
                    <td>{facilityTypeLabel(f.facilityType)}</td>
                    <td>{f.city}</td>
                    <td>{f.adminContact || <span className="text-slate">—</span>}</td>
                    <td>{f.staffCount.toLocaleString()}</td>
                    <td>
                      <Badge
                        label={f.isActive ? 'Active' : 'Inactive'}
                        variant={f.isActive ? 'success' : 'neutral'}
                      />
                    </td>
                    <td>
                      <span className="text-[12px]">
                        <button
                          onClick={() => navigate(`/superadmin/facilities/${f.id}`)}
                          className="text-navy-2 font-semibold hover:underline bg-transparent outline-none cursor-pointer"
                        >
                          View / Edit
                        </button>
                        <span className="text-slate mx-[6px]">·</span>
                        <button
                          onClick={() => handleToggleStatus(f)}
                          disabled={togglingId === f.id}
                          className={`font-semibold hover:underline bg-transparent outline-none cursor-pointer disabled:opacity-50 ${f.isActive ? 'text-urgent' : 'text-success'}`}
                        >
                          {togglingId === f.id ? '…' : f.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </SuperAdminLayout>
  );
}
