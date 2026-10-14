import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Panel from '../components/ui/Panel';
import adminShiftsService, { AdminShiftDetail, ApplicantRow } from '../services/adminShiftsService';
import { apiError } from '../utils/apiError';
import { shiftDateRange } from '../utils/shiftDates';

type BadgeVariant = 'success' | 'warning' | 'urgent' | 'neutral' | 'info';

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    doctor: 'Doctor',
    nurse: 'Nurse',
    ot_tech: 'OT Tech',
    housekeeping: 'Housekeeping',
    facility_admin: 'Admin',
  };
  return map[role] ?? role;
}

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'open': return 'urgent';
    case 'filled': return 'success';
    case 'pending': return 'warning';
    case 'completed': return 'neutral';
    case 'cancelled': return 'urgent';
    case 'draft': return 'info';
    default: return 'neutral';
  }
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shiftTimeLabel(start: string, end: string): string {
  const fmt = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${shiftDateRange(start, end)}, ${fmt(start)} – ${fmt(end)}`;
}

export default function ShiftDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shift, setShift] = useState<AdminShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCancelPanel, setShowCancelPanel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await adminShiftsService.getShift(parseInt(id));
      setShift(data);
    } catch {} finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async (applicant: ApplicantRow) => {
    if (!shift || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminShiftsService.assignApplicant(shift.id, applicant.applicationId);
      setShift(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to assign applicant. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (applicant: ApplicantRow) => {
    if (!shift || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminShiftsService.rejectApplicant(shift.id, applicant.applicationId);
      setShift(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to reject applicant. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!shift || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminShiftsService.cancelShift(shift.id, cancelReason.trim() || undefined);
      setShift(updated);
      setShowCancelPanel(false);
      setCancelReason('');
    } catch (err) {
      setActionError(apiError(err, 'Failed to cancel shift. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  // Opens Create Shift pre-filled from this shift, so dates, times and pay can
  // be changed before anything is saved.
  const handleDuplicate = () => {
    if (!shift) return;
    navigate(`/shifts/new?duplicate=${shift.id}`);
  };

  const handlePublish = async () => {
    if (!shift || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminShiftsService.publishShift(shift.id);
      setShift(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to publish shift. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!shift || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminShiftsService.completeShift(shift.id);
      setShift(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to mark shift complete. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <Layout><p className="text-slate text-[12px]">Loading…</p></Layout>;
  }

  if (!shift) {
    return <Layout><p className="text-slate text-[12px]">Shift not found.</p></Layout>;
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-[2px]">
            <h1 className="font-display font-extrabold text-[16.5px] text-ink">{shift.title ?? shift.specialty}</h1>
            <Badge label={shift.displayStatus} variant={statusVariant(shift.status)} />
          </div>
          <p className="text-[11.5px] text-slate">
            {shift.reference} · {shift.facilityName} · {shiftTimeLabel(shift.startTime, shift.endTime)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {actionError && (
            <p className="text-[11px] text-urgent font-semibold">{actionError}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDuplicate}
              disabled={actionLoading}
              className="border-[1.5px] border-navy text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] bg-transparent disabled:opacity-60"
            >
              Duplicate
            </button>
            {shift.status === 'draft' && (
              <button
                onClick={handlePublish}
                disabled={actionLoading}
                className="bg-navy text-white text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] disabled:opacity-60"
              >
                {actionLoading ? 'Publishing…' : 'Publish Shift'}
              </button>
            )}
            {shift.status === 'filled' && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="bg-sky text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] disabled:opacity-60"
              >
                {actionLoading ? 'Updating…' : 'Mark Complete'}
              </button>
            )}
            {['open', 'pending', 'filled'].includes(shift.status) && !showCancelPanel && new Date(shift.startTime) > new Date() && (
              <button
                onClick={() => setShowCancelPanel(true)}
                disabled={actionLoading}
                className="bg-urgent-bg text-urgent text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] disabled:opacity-60"
              >
                Cancel Shift
              </button>
            )}
          </div>
          {showCancelPanel && (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="px-3 py-[7px] border-[1.4px] border-line rounded-[9px] text-[12px] text-ink outline-none focus:border-urgent w-[200px]"
              />
              <button
                onClick={() => { setShowCancelPanel(false); setCancelReason(''); }}
                className="text-[11.5px] font-semibold text-slate px-2"
              >
                Back
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="bg-urgent-bg text-urgent text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] disabled:opacity-60"
              >
                {actionLoading ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        {/* Left */}
        <div>
          <Panel title="Applicants">
            <div className="overflow-hidden rounded-[10px] border border-line">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{roleLabel(shift.role)}</th>
                    <th>Specialty</th>
                    <th>Rating</th>
                    <th>Applied</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shift.applicants.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-[12px] text-slate py-6">No applicants yet.</td></tr>
                  ) : shift.applicants.map((a) => (
                    <tr key={a.applicationId}>
                      <td className="font-semibold">
                        <Link to={`/staff/${a.staffId}`} className="text-navy-2 hover:underline">{a.name}</Link>
                      </td>
                      <td>{a.specialty ?? '—'}</td>
                      <td>{a.rating.toFixed(1)}★</td>
                      <td className="text-slate">{timeAgo(a.appliedAt)}</td>
                      <td><Badge label={a.status} variant={a.status === 'confirmed' ? 'success' : a.status === 'completed' ? 'neutral' : a.status === 'rejected' || a.status === 'cancelled' ? 'urgent' : 'warning'} /></td>
                      <td className="text-[12px]">
                        <Link to={`/staff/${a.staffId}`} className="text-navy-2 font-semibold hover:underline">Profile</Link>
                        {a.status === 'pending' && !['completed', 'cancelled'].includes(shift.status) && (
                          <>
                            {shift.slotsFilled < shift.slots && (
                              <>
                                {' · '}
                                <span
                                  className="text-navy-2 font-semibold cursor-pointer hover:underline"
                                  onClick={() => handleAssign(a)}
                                >Accept</span>
                              </>
                            )}
                            {' · '}
                            <span
                              className="text-urgent font-semibold cursor-pointer hover:underline"
                              onClick={() => handleReject(a)}
                            >Reject</span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Shift Timeline">
            {shift.timeline.map((item) => (
              <div
                key={item.label}
                className={`text-[11.5px] pl-3 ml-1 py-[6px] border-l-2 ${item.done ? 'border-sky-2 text-ink' : 'border-line text-slate'}`}
              >
                {item.label}{item.at && ` — ${new Date(item.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`}
              </div>
            ))}
          </Panel>
        </div>

        {/* Right */}
        <div>
          <Panel title="Assigned Staff Member">
            {shift.assignedStaff.length === 0 ? (
              <>
                <p className="text-center text-slate text-[11.5px] py-4">No staff member assigned yet</p>
                {shift.applicants.some(a => a.status === 'applied') && (
                  <p className="text-center text-[11px] text-slate">Accept an applicant above to assign them.</p>
                )}
              </>
            ) : (
              <div className="text-[12.5px] font-semibold text-ink py-2">{shift.assignedStaff.join(', ')}</div>
            )}
          </Panel>

          <Panel title="Shift Details">
            {[
              `Specialty: ${shift.specialty}`,
              `Duration: ${shift.durationHours}h`,
              `Pay Rate (per shift): ₹${shift.payRate.toLocaleString('en-IN')}`,
              shift.overtimeRate ? `Overtime Rate (per hour): ₹${shift.overtimeRate.toLocaleString('en-IN')}` : null,
              shift.requiredQualifications.length > 0 ? `Qualifications: ${shift.requiredQualifications.join(', ')}` : null,
              shift.requiredCertifications.length > 0 ? `Certifications: ${shift.requiredCertifications.join(', ')}` : null,
              shift.requirements ? `Notes: ${shift.requirements}` : null,
            ].filter(Boolean).map((row) => (
              <div key={row as string} className="text-[11.5px] text-slate py-[5px] border-b border-line last:border-0">
                {row}
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </Layout>
  );
}
