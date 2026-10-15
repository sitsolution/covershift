import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Panel from '../components/ui/Panel';
import ChatDrawer from '../components/ChatDrawer';
import adminBookingsService, { BookingDetail } from '../services/adminBookingsService';
import { apiError } from '../utils/apiError';
import { shiftDateRange } from '../utils/shiftDates';

type BadgeVariant = 'success' | 'warning' | 'urgent' | 'info' | 'neutral';

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'confirmed': return 'success';
    case 'upcoming': return 'info';
    case 'pending': return 'warning';
    case 'completed': return 'neutral';
    case 'cancelled': return 'urgent';
    default: return 'neutral';
  }
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    doctor: 'Doctor', nurse: 'Nurse', ot_tech: 'OT Tech',
    housekeeping: 'Housekeeping', facility_admin: 'Admin',
  };
  return map[role] ?? role;
}

function shiftLabel(booking: BookingDetail): string {
  const start = new Date(booking.shiftStart);
  const end = new Date(booking.shiftEnd);
  const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${booking.shiftLabel} · ${shiftDateRange(booking.shiftStart, booking.shiftEnd)}, ${fmt(start)} – ${fmt(end)}`;
}

function msgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function BookingDetails() {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showCancelPanel, setShowCancelPanel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await adminBookingsService.getBooking(parseInt(id));
      setBooking(data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const status = err?.response?.status;
      if (status === 404) {
        setLoadError('Booking not found.');
      } else {
        setLoadError(detail ? `Error: ${detail}` : `Failed to load booking (${status ?? 'network error'}).`);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async () => {
    if (!id || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminBookingsService.acceptBooking(parseInt(id));
      setBooking(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to accept booking. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!id || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminBookingsService.completeBooking(parseInt(id));
      setBooking(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to complete booking. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePaymentDone = async () => {
    if (!id || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminBookingsService.markPaymentDone(parseInt(id));
      setBooking(updated);
    } catch (err) {
      setActionError(apiError(err, 'Failed to mark payment as done.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const updated = await adminBookingsService.cancelBooking(parseInt(id), cancelReason.trim() || undefined);
      setBooking(updated);
      setShowCancelPanel(false);
      setCancelReason('');
    } catch (err) {
      setActionError(apiError(err, 'Failed to cancel booking. Please try again.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <Layout><p className="text-slate text-[12px]">Loading…</p></Layout>;
  }

  if (loadError || !booking) {
    return <Layout><p className="text-urgent text-[12px]">{loadError || 'Booking not found.'}</p></Layout>;
  }

  return (
    <Layout>
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-[2px]">
          <h1 className="font-display font-extrabold text-[16.5px] text-ink">Booking {booking.reference}</h1>
          <Badge label={booking.displayStatus} variant={statusVariant(booking.status)} />
        </div>
        <p className="text-[11.5px] text-slate">{shiftLabel(booking)} · {booking.facilityName}</p>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        {/* Left */}
        <div>
          <Panel title="Timeline">
            {booking.timeline.map((item) => (
              <div
                key={item.label}
                className={`text-[11.5px] pl-3 ml-1 py-[6px] border-l-2 ${
                  item.done ? 'border-success text-ink' : 'border-line text-slate-2'
                }`}
              >
                {item.label}
                {item.at
                  ? ` — ${new Date(item.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                  : !item.done ? <span className="text-slate-2"> — pending</span> : ''}
              </div>
            ))}
          </Panel>

          <Panel title="Communication Log">
            <div className="max-h-[280px] overflow-y-auto">
              {booking.messages.length === 0 ? (
                <p className="text-[12px] text-slate text-center py-4">No messages yet.</p>
              ) : booking.messages.map((log) => (
                <div key={log.id} className="flex gap-[10px] items-start py-[11px] border-b border-line last:border-0">
                  <div className="w-9 h-9 rounded-full bg-sky flex items-center justify-center font-extrabold text-[12px] text-navy flex-shrink-0">
                    {log.authorName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[12px] text-ink font-medium">{log.body}</p>
                    <p className="text-[11px] text-slate mt-[2px]">{log.authorName} · {msgTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Right */}
        <div>
          <Panel title={roleLabel(booking.shiftRole)}>
            <div className="flex gap-[10px] items-center">
              <div className="w-9 h-9 rounded-full bg-sky flex items-center justify-center font-extrabold text-[12px] text-navy flex-shrink-0">
                {booking.staffInitials}
              </div>
              <div>
                <p className="font-bold text-[12.5px] text-ink">{booking.staffName}</p>
                <p className="text-[11px] text-slate">{booking.staffSpecialty ?? '—'} · {booking.staffRating.toFixed(1)}★</p>
                {booking.staffEmail && <p className="text-[11px] text-slate">{booking.staffEmail}</p>}
              </div>
            </div>
          </Panel>

          <Panel title="Shift Details">
            {[
              `Specialty: ${booking.specialty}`,
              `Pay Rate: ₹${booking.payRate.toLocaleString('en-IN')}`,
              `Duration: ${booking.durationHours}h`,
            ].map((row) => (
              <div key={row} className="text-[11.5px] text-slate py-[5px] border-b border-line last:border-0">{row}</div>
            ))}
          </Panel>

          <Panel title="Actions">
            {actionError && (
              <p className="text-[11px] text-urgent font-semibold mb-2">{actionError}</p>
            )}
            {booking.status === 'pending' && new Date(booking.shiftStart) > new Date() && (
              <button
                onClick={handleAccept}
                disabled={actionLoading}
                className="w-full bg-success text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] mb-2 disabled:opacity-60"
              >
                {actionLoading ? 'Accepting…' : 'Accept Booking'}
              </button>
            )}
            {booking.staffId && (
              <button
                onClick={() => setChatOpen(true)}
                className="block w-full bg-sky text-navy text-[13px] font-bold px-4 py-[11px] rounded-[10px] mb-2 text-center"
              >
                Contact Staff Member
              </button>
            )}
            {['confirmed', 'upcoming'].includes(booking.status) && (
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="w-full bg-sky text-navy text-[13px] font-bold px-4 py-[11px] rounded-[10px] mb-2 disabled:opacity-60"
              >
                {actionLoading ? 'Updating…' : 'Mark as Completed'}
              </button>
            )}
            {booking.status === 'completed' && booking.paymentStatus === 'pending' && (
              <button
                onClick={handlePaymentDone}
                disabled={actionLoading}
                className="w-full bg-success text-white text-[13px] font-bold px-4 py-[11px] rounded-[10px] mb-2 disabled:opacity-60"
              >
                {actionLoading ? 'Processing…' : 'Payment Done'}
              </button>
            )}
            {booking.status === 'completed' && booking.paymentStatus && booking.paymentStatus !== 'pending' && (
              <div className="w-full text-center text-[12px] text-success font-semibold py-[10px] bg-[#E3F5EC] rounded-[10px] mb-2">
                ✓ Payment {booking.paymentStatus === 'processing' ? 'Received by Staff' : 'Sent'}
              </div>
            )}
            {['pending', 'confirmed', 'upcoming'].includes(booking.status) && new Date(booking.shiftStart) > new Date() && !showCancelPanel && (
              <button
                onClick={() => setShowCancelPanel(true)}
                disabled={actionLoading}
                className="w-full bg-urgent-bg text-urgent text-[13px] font-bold px-4 py-[11px] rounded-[10px] disabled:opacity-60"
              >
                Cancel Booking
              </button>
            )}
            {showCancelPanel && (
              <div className="mt-1">
                <input
                  type="text"
                  placeholder="Reason for cancellation (optional)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-[9px] border-[1.4px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-urgent mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCancelPanel(false); setCancelReason(''); }}
                    className="flex-1 bg-sky text-navy text-[12px] font-bold px-3 py-[9px] rounded-[9px]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={actionLoading}
                    className="flex-1 bg-urgent-bg text-urgent text-[12px] font-bold px-3 py-[9px] rounded-[9px] disabled:opacity-60"
                  >
                    {actionLoading ? 'Cancelling…' : 'Confirm Cancel'}
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {chatOpen && booking.staffId && (
        <ChatDrawer
          staffId={booking.staffId}
          staffName={booking.staffName}
          onClose={() => setChatOpen(false)}
        />
      )}
    </Layout>
  );
}
