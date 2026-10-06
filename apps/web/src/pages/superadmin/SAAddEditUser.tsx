import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import Panel from '../../components/ui/Panel';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import superAdminService, { SAFacility, SAUserDetail } from '../../services/superAdminService';

const DOC_TYPE_OPTIONS = [
  { value: 'medical_license',        label: 'Medical License'        },
  { value: 'nursing_registration',   label: 'Nursing Registration'   },
  { value: 'ot_certification',       label: 'OT Certification'       },
  { value: 'bls_certification',      label: 'BLS Certification'      },
  { value: 'acls_certification',     label: 'ACLS Certification'     },
  { value: 'id_proof',               label: 'ID Proof'               },
  { value: 'educational_certificate',label: 'Educational Certificate'},
  { value: 'other',                  label: 'Other'                  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { label: 'Doctor',         value: 'doctor'         },
  { label: 'Nurse',          value: 'nurse'          },
  { label: 'OT Technician',  value: 'ot_tech'        },
  { label: 'Housekeeping',   value: 'housekeeping'   },
  { label: 'Facility Admin', value: 'facility_admin' },
  { label: 'Super Admin',    value: 'super_admin'    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function permissionsText(role: string): string {
  switch (role) {
    case 'super_admin':    return 'Platform-wide access to all facilities, users, reports and settings.';
    case 'facility_admin': return 'Can administer assigned facility: shifts, bookings, documents, staff.';
    default:               return 'Can apply to shifts, manage own availability, upload own documents, view own activity.';
  }
}

function docStatusVariant(status: string): 'success' | 'warning' | 'urgent' | 'neutral' {
  switch (status) {
    case 'verified': return 'success';
    case 'pending':  return 'warning';
    case 'rejected': return 'urgent';
    case 'expired':  return 'urgent';
    default:         return 'neutral';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputCls = 'w-full px-3 py-[10px] border-[1.4px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-navy-2 bg-white';
const labelCls = 'block text-[11.5px] font-bold text-slate mb-[6px]';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SAAddEditUser() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [user, setUser]           = useState<SAUserDetail | null>(null);
  const [loading, setLoading]     = useState(isEdit);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [deleting, setDeleting]                 = useState(false);
  const [showResetModal, setShowResetModal]     = useState(false);
  const [resetting, setResetting]               = useState(false);
  const [facilities, setFacilities] = useState<SAFacility[]>([]);

  // Upload document modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDocType, setUploadDocType]     = useState('medical_license');
  const [uploadDocNumber, setUploadDocNumber] = useState('');
  const [uploadIssueDate, setUploadIssueDate] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [uploadFile, setUploadFile]           = useState<File | null>(null);
  const [uploading, setUploading]             = useState(false);
  const [uploadError, setUploadError]         = useState('');
  const fileInputRef                          = useRef<HTMLInputElement>(null);

  // Form fields
  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [role, setRole]           = useState('doctor');
  const [isActive, setIsActive]   = useState(true);
  const [facilityId, setFacilityId] = useState('');

  // Load facilities for the select
  useEffect(() => {
    superAdminService.getFacilities({ limit: 200 }).then((r) => setFacilities(r.items)).catch(() => {});
  }, []);

  // Load user in edit mode
  useEffect(() => {
    if (!isEdit || !id) return;
    superAdminService
      .getUser(parseInt(id, 10))
      .then((u) => {
        setUser(u);
        setFullName(u.fullName);
        setEmail(u.email);
        setPhone(u.phone ?? '');
        setRole(u.role);
        setIsActive(u.isActive);
        setFacilityId(u.facilityId ? String(u.facilityId) : '');
      })
      .catch(() => setError('Failed to load user.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!isEdit && !password) errs.password = 'Password is required.';
    else if (!isEdit && password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!isEdit) {
        await superAdminService.createUser({
          fullName,
          email,
          phone: phone || null,
          password,
          role,
          isActive,
          facilityId: facilityId ? parseInt(facilityId, 10) : null,
        });
        navigate('/superadmin/users');
      } else {
        await superAdminService.updateUser(parseInt(id!, 10), {
          fullName,
          email,
          phone: phone || null,
          role,
          isActive,
          facilityId: facilityId ? parseInt(facilityId, 10) : 0,
        });
        setSuccess('User updated successfully.');
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await superAdminService.deleteUser(parseInt(id, 10));
      navigate('/superadmin/users');
    } catch {
      setError('Failed to deactivate user.');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!id) return;
    setResetting(true);
    try {
      const res = await superAdminService.resetUserPassword(parseInt(id, 10));
      setShowResetModal(false);
      setSuccess(res.message);
    } catch {
      setShowResetModal(false);
      setError('Failed to send reset email. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  const openUploadModal = () => {
    setUploadDocType('medical_license');
    setUploadDocNumber('');
    setUploadIssueDate('');
    setUploadExpiryDate('');
    setUploadFile(null);
    setUploadError('');
    setShowUploadModal(true);
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !id) return;
    setUploading(true);
    setUploadError('');
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('docType', uploadDocType);
      if (uploadDocNumber) form.append('documentNumber', uploadDocNumber);
      if (uploadIssueDate)  form.append('issueDate', uploadIssueDate);
      if (uploadExpiryDate) form.append('expiryDate', uploadExpiryDate);
      await superAdminService.uploadUserDocument(parseInt(id, 10), form);
      // Refresh user to update documents table
      const updated = await superAdminService.getUser(parseInt(id, 10));
      setUser(updated);
      setShowUploadModal(false);
      setSuccess('Document uploaded successfully.');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(detail ?? 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const pageTitle = isEdit ? `Edit User — ${user?.fullName ?? '…'}` : 'Add New User';

  return (
    <SuperAdminLayout>
      {/* Header */}
      <div className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">{pageTitle}</div>
      <div className="text-[11.5px] text-slate mb-4">
        {isEdit ? 'Update profile, role, facility assignment & documents' : 'Create a new user account on the platform'}
      </div>

      {error && (
        <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-3 py-[9px] bg-success-bg border border-success rounded-[8px] text-[11.5px] text-success font-semibold">
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-[12px] text-slate py-10 text-center">Loading…</div>
      ) : (
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-[1.4fr_1fr] gap-4">

            {/* Left column */}
            <div>
              <Panel title="User Details">
                <div className="flex flex-col gap-[13px]">
                  <div>
                    <label className={labelCls}>Full Name<span className="text-urgent ml-[2px]">*</span></label>
                    <input type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); setFieldErrors(p => ({ ...p, fullName: '' })); }} className={`${inputCls} ${fieldErrors.fullName ? 'border-urgent' : ''}`} placeholder="Full name" />
                    {fieldErrors.fullName && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.fullName}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Email Address<span className="text-urgent ml-[2px]">*</span></label>
                    <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }} className={`${inputCls} ${fieldErrors.email ? 'border-urgent' : ''}`} placeholder="email@example.com" />
                    {fieldErrors.email && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.email}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Phone Number</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" className={inputCls} />
                  </div>
                  {!isEdit && (
                    <div>
                      <label className={labelCls}>Password<span className="text-urgent ml-[2px]">*</span></label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                        placeholder="Min. 8 characters"
                        className={`${inputCls} ${fieldErrors.password ? 'border-urgent' : ''}`}
                      />
                      {fieldErrors.password && <p className="text-[11px] text-urgent mt-[4px] font-medium">{fieldErrors.password}</p>}
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Role</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls + ' cursor-pointer'}>
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Assigned Facility</label>
                    <select value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className={inputCls + ' cursor-pointer'}>
                      <option value="">— Platform-wide (no facility) —</option>
                      {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')} className={inputCls + ' cursor-pointer'}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive / Suspended</option>
                    </select>
                  </div>
                </div>
              </Panel>

              {/* Documents (edit mode only) */}
              {isEdit && (
                <Panel
                  title="Documents & Certificates"
                  action={
                    <button
                      type="button"
                      onClick={openUploadModal}
                      className="bg-sky text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] hover:bg-sky-2 transition-colors"
                    >
                      + Upload Document
                    </button>
                  }
                >
                  {(user?.documents ?? []).length === 0 ? (
                    <p className="text-[12px] text-slate text-center py-4">No documents uploaded.</p>
                  ) : (
                    <div className="overflow-hidden rounded-[10px] border border-line">
                      <table className="adm-table">
                        <thead>
                          <tr>
                            <th>Document</th>
                            <th>Type</th>
                            <th>Uploaded</th>
                            <th>Expiry</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(user?.documents ?? []).map((doc) => (
                            <tr key={doc.id}>
                              <td className="font-semibold text-[11.5px]">{doc.originalFilename}</td>
                              <td className="text-[11.5px]">{doc.docType.replace(/_/g, ' ')}</td>
                              <td className="text-[11.5px]">{formatDate(doc.uploadedAt)}</td>
                              <td className="text-[11.5px]">{formatDate(doc.expiryDate)}</td>
                              <td>
                                <Badge
                                  label={doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                                  variant={docStatusVariant(doc.status)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              )}
            </div>

            {/* Right column */}
            <div>
              <Panel title="Permissions Summary">
                <div className="text-[11.5px] text-slate leading-[1.7]">
                  Role: <b className="text-ink">{ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role}</b>
                  <br />
                  {permissionsText(role)}
                </div>
              </Panel>

              <div className="flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-navy text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60 hover:bg-navy-2 transition-colors"
                >
                  {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
                </button>

                {isEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      className="w-full bg-transparent text-navy border-[1.5px] border-navy text-[13px] font-bold px-4 py-[11px] rounded-[10px] hover:bg-navy hover:text-white transition-colors"
                    >
                      Reset Password
                    </button>

                    {/* Hide Delete for super_admin users */}
                    {!isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="w-full bg-urgent-bg text-urgent border border-urgent text-[13px] font-bold px-4 py-[11px] rounded-[10px] hover:bg-urgent hover:text-white transition-colors"
                      >
                        Delete User
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => navigate('/superadmin/users')}
                  className="w-full text-[12px] text-slate hover:text-ink transition-colors bg-transparent outline-none cursor-pointer text-center pt-1"
                >
                  ← Back to Users
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Reset password confirmation modal */}
      {showResetModal && (
        <Modal
          title="Reset password?"
          message={`A password reset email will be sent to ${email}. They will need to follow the link in the email to set a new password.`}
          confirmLabel="Send Reset Email"
          confirmVariant="primary"
          loading={resetting}
          onConfirm={handleResetPassword}
          onCancel={() => setShowResetModal(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <Modal
          title="Deactivate user?"
          message={`"${fullName}" will be deactivated and lose access to the platform. This can be reversed later by editing the user.`}
          confirmLabel="Deactivate"
          confirmVariant="danger"
          loading={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Upload document modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[14px] shadow-xl w-full max-w-[460px] mx-4">
            <div className="px-5 pt-5 pb-3 border-b border-line flex items-center justify-between">
              <span className="font-display font-extrabold text-[15px] text-ink">Upload Document</span>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate hover:text-ink text-[18px] leading-none bg-transparent outline-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleUploadDocument} className="px-5 py-4 flex flex-col gap-[13px]">
              {uploadError && (
                <div className="px-3 py-[8px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
                  {uploadError}
                </div>
              )}
              <div>
                <label className={labelCls}>Document Type *</label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className={inputCls + ' cursor-pointer'}
                  required
                >
                  {DOC_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-[12px] text-ink file:mr-3 file:py-[6px] file:px-3 file:rounded-[7px] file:border-0 file:bg-navy file:text-white file:text-[11.5px] file:font-semibold file:cursor-pointer"
                />
              </div>
              <div>
                <label className={labelCls}>Document Number (optional)</label>
                <input
                  type="text"
                  value={uploadDocNumber}
                  onChange={(e) => setUploadDocNumber(e.target.value)}
                  placeholder="e.g. MCI-123456"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Issue Date (optional)</label>
                  <input
                    type="date"
                    value={uploadIssueDate}
                    onChange={(e) => setUploadIssueDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Expiry Date (optional)</label>
                  <input
                    type="date"
                    value={uploadExpiryDate}
                    onChange={(e) => setUploadExpiryDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="flex-1 bg-navy text-white text-[13px] font-bold py-[10px] rounded-[10px] disabled:opacity-60 hover:bg-navy-2 transition-colors"
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 border-[1.5px] border-line text-slate text-[13px] font-bold py-[10px] rounded-[10px] hover:border-navy-2 hover:text-ink transition-colors bg-transparent"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}
