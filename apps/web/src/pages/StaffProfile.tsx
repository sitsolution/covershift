import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import Panel from '../components/ui/Panel';
import TabNav from '../components/ui/TabNav';
import ChatDrawer from '../components/ChatDrawer';
import adminStaffService, { StaffDetail, StaffShiftHistoryRow, StaffReviewOut, StaffNoteOut } from '../services/adminStaffService';
import { shiftDateRange } from '../utils/shiftDates';

const TABS = ['Overview', 'Professional Details', 'Documents', 'Shift History', 'Reviews', 'Notes'];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="text-[22px] leading-none focus:outline-none"
          style={{ color: star <= (hovered || value) ? '#F4A418' : '#CBD5E0' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('Overview');
  const [profile, setProfile] = useState<StaffDetail | null>(null);
  const [shifts, setShifts] = useState<StaffShiftHistoryRow[]>([]);
  const [reviews, setReviews] = useState<StaffReviewOut[]>([]);
  const [notes, setNotes] = useState<StaffNoteOut[]>([]);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);

  // Review form
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewShiftId, setReviewShiftId] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const staffId = id ? parseInt(id) : 0;

  const loadProfile = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const [p, s, r, n] = await Promise.all([
        adminStaffService.getStaff(staffId),
        adminStaffService.getShiftHistory(staffId),
        adminStaffService.getReviews(staffId),
        adminStaffService.getNotes(staffId),
      ]);
      setProfile(p);
      setShifts(s);
      setReviews(r);
      setNotes(n);
    } catch {} finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleAddNote = async () => {
    if (!noteText.trim() || !staffId) return;
    try {
      const note = await adminStaffService.createNote(staffId, noteText.trim());
      setNotes(prev => [note, ...prev]);
      setNoteText('');
    } catch {}
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await adminStaffService.deleteNote(staffId, noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch {}
  };

  const handleAddReview = async () => {
    if (reviewRating === 0) { setReviewError('Please select a star rating.'); return; }
    setSubmittingReview(true);
    setReviewError('');
    try {
      const review = await adminStaffService.createReview(staffId, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
        shiftId: reviewShiftId ? parseInt(reviewShiftId) : undefined,
      });
      setReviews(prev => [review, ...prev]);
      setShowReviewForm(false);
      setReviewRating(0);
      setReviewComment('');
      setReviewShiftId('');
    } catch (err: any) {
      setReviewError(err?.response?.data?.detail ?? 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return <Layout><p className="text-slate text-[12px]">Loading…</p></Layout>;
  }

  if (!profile) {
    return <Layout><p className="text-slate text-[12px]">Staff member not found.</p></Layout>;
  }

  return (
    <Layout>
      {/* Profile Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-[16px] bg-sky flex items-center justify-center font-extrabold text-[20px] text-navy flex-shrink-0">
          {profile.initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-[2px]">
            <span className="font-extrabold text-[15px] text-ink">{profile.name}</span>
            <Badge label={profile.isVerified ? 'Verified' : 'Pending'} variant={profile.isVerified ? 'success' : 'warning'} />
          </div>
          <p className="text-[11.5px] text-slate">
            {profile.specialty ?? profile.roleLabel} · {profile.stats.rating.toFixed(1)}★ · {profile.preferredLocations.join(', ') || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className="border-[1.5px] border-navy text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] bg-transparent">
              📞 Call
            </a>
          )}
          <button
            onClick={() => setChatOpen(true)}
            className="border-[1.5px] border-navy text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] bg-transparent"
          >
            ✉ Message
          </button>
        </div>
      </div>

      {/* Tab Nav */}
      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'Overview' && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-[18px]">
            <KpiCard label="Total Shifts" value={String(profile.stats.shiftsCompleted)} delta="All-time" />
            <KpiCard label="Completion Rate" value={`${profile.stats.completionRate}%`} delta="Above network avg" deltaColor="#1F8A5F" />
            <KpiCard label="Response Time" value={formatResponseTime(profile.stats.avgResponseMinutes)} delta="Median" />
            <KpiCard label="Rating" value={`${profile.stats.rating.toFixed(1)}★`} delta={`${profile.stats.reviewsCount} reviews`} />
          </div>

          <Panel title="Recent Shifts">
            <div className="overflow-hidden rounded-[10px] border border-line">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Facility</th>
                    <th>Status</th>
                    <th>Rating Given</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-[12px] text-slate py-6">No shifts yet.</td></tr>
                  ) : shifts.slice(0, 5).map((s) => (
                    <tr key={s.shiftId}>
                      <td>{shiftDateRange(s.startTime, s.endTime)}</td>
                      <td>{s.facilityName}</td>
                      <td><Badge label={s.status} variant={s.status === 'completed' ? 'neutral' : s.status === 'confirmed' ? 'success' : s.status === 'cancelled' ? 'urgent' : 'warning'} /></td>
                      <td>{s.ratingGiven ? `${s.ratingGiven}★` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {activeTab === 'Professional Details' && (
        <Panel title="Professional Details">
          {[
            profile.credentialNumber ? `${profile.credentialLabel}: ${profile.credentialNumber}` : null,
            profile.specialty ? `Specialty: ${profile.specialty}` : null,
            profile.experience ? `Experience: ${profile.experience}` : null,
            profile.qualifications ? `Qualifications: ${profile.qualifications}` : null,
            profile.minPayRate ? `Min Pay Rate: ₹${profile.minPayRate.toLocaleString('en-IN')}/shift` : null,
            profile.preferredLocations.length > 0 ? `Preferred Locations: ${profile.preferredLocations.join(', ')}` : null,
          ].filter(Boolean).map((row) => (
            <div key={row as string} className="text-[11.5px] text-slate py-[5px] border-b border-line last:border-0">
              {row}
            </div>
          ))}
        </Panel>
      )}

      {activeTab === 'Documents' && (
        <Panel title="Documents">
          {!profile.canViewDocuments ? (
            <p className="text-[12px] text-slate text-center py-4">You don't have permission to view this staff member's documents.</p>
          ) : (profile.documents as any[]).length === 0 ? (
            <p className="text-[12px] text-slate text-center py-4">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-hidden rounded-[10px] border border-line">
              <table className="adm-table">
                <thead>
                  <tr><th>Document</th><th>Type</th><th>Expires</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(profile.documents as any[]).map((d) => (
                    <tr key={d.id}>
                      <td className="font-semibold">{d.originalFilename}</td>
                      <td>{d.docTypeLabel}</td>
                      <td className="text-slate">{d.expiryDate ? new Date(d.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td><Badge label={d.status.charAt(0).toUpperCase() + d.status.slice(1)} variant={d.status === 'verified' ? 'success' : d.status === 'rejected' || d.status === 'expired' ? 'urgent' : 'warning'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'Shift History' && (
        <Panel title="Shift History">
          <div className="overflow-hidden rounded-[10px] border border-line">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Facility</th>
                  <th>Specialty</th>
                  <th>Status</th>
                  <th>Pay</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-[12px] text-slate py-6">No shift history.</td></tr>
                ) : shifts.map((s) => (
                  <tr key={s.shiftId}>
                    <td className="font-semibold">{s.reference}</td>
                    <td>{shiftDateRange(s.startTime, s.endTime)}</td>
                    <td>{s.facilityName}</td>
                    <td>{s.specialty}</td>
                    <td><Badge label={s.status} variant={s.status === 'completed' ? 'neutral' : s.status === 'cancelled' ? 'urgent' : 'warning'} /></td>
                    <td>₹{s.payRate.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {activeTab === 'Reviews' && (
        <Panel title="Reviews">
          {/* Summary bar */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-line">
            <div className="flex items-center gap-3">
              <span className="text-[26px] font-extrabold text-ink leading-none">
                {profile.stats.rating > 0 ? profile.stats.rating.toFixed(1) : '—'}
              </span>
              <div>
                <div className="flex gap-[2px] mb-[2px]">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className="text-[15px]" style={{ color: s <= Math.round(profile.stats.rating) ? '#F4A418' : '#CBD5E0' }}>★</span>
                  ))}
                </div>
                <p className="text-[11px] text-slate">{profile.stats.reviewsCount} {profile.stats.reviewsCount === 1 ? 'review' : 'reviews'} across all facilities</p>
              </div>
            </div>
            {!showReviewForm && (() => {
              const canReview = shifts.some(s => s.status === 'completed');
              return (
                <div className="flex flex-col items-end gap-[4px]">
                  <button
                    onClick={() => { setShowReviewForm(true); setReviewError(''); }}
                    disabled={!canReview}
                    title={!canReview ? 'Reviews can only be left after the staff member completes a shift at your facility' : undefined}
                    className="bg-navy text-white text-[12px] font-bold px-4 py-[8px] rounded-[9px] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Write a Review
                  </button>
                  {!canReview && (
                    <p className="text-[10.5px] text-slate text-right leading-tight">
                      Available after a completed shift
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Review form */}
          {showReviewForm && (
            <div className="mb-4 p-4 bg-paper rounded-[10px] border border-line">
              <p className="text-[12px] font-bold text-ink mb-3">Rate {profile.name}</p>

              <div className="mb-3">
                <label className="block text-[11px] font-bold text-slate mb-[6px]">Rating</label>
                <StarPicker value={reviewRating} onChange={(v) => { setReviewRating(v); setReviewError(''); }} />
              </div>

              {/* Link to a completed shift (optional) */}
              {shifts.filter(s => s.status === 'completed').length > 0 && (
                <div className="mb-3">
                  <label className="block text-[11px] font-bold text-slate mb-[6px]">Linked Shift (optional)</label>
                  <select
                    value={reviewShiftId}
                    onChange={(e) => setReviewShiftId(e.target.value)}
                    className="w-full px-3 py-[9px] border-[1.4px] border-line rounded-[9px] text-[12px] text-ink bg-white outline-none focus:border-navy-2 appearance-none"
                  >
                    <option value="">— Not linked to a specific shift —</option>
                    {shifts.filter(s => s.status === 'completed').map((s) => (
                      <option key={s.shiftId} value={String(s.shiftId)}>
                        {s.reference} · {shiftDateRange(s.startTime, s.endTime)} · {s.facilityName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-3">
                <label className="block text-[11px] font-bold text-slate mb-[6px]">Comment (optional)</label>
                <textarea
                  placeholder="Describe the staff member's performance…"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-[9px] border-[1.4px] border-line rounded-[9px] text-[12px] text-ink bg-white outline-none focus:border-navy-2 resize-none"
                />
              </div>

              {reviewError && <p className="text-[11px] text-urgent font-semibold mb-2">{reviewError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={handleAddReview}
                  disabled={submittingReview}
                  className="bg-navy text-white text-[12px] font-bold px-4 py-[8px] rounded-[9px] disabled:opacity-60"
                >
                  {submittingReview ? 'Submitting…' : 'Submit Review'}
                </button>
                <button
                  onClick={() => { setShowReviewForm(false); setReviewRating(0); setReviewComment(''); setReviewShiftId(''); setReviewError(''); }}
                  className="text-slate text-[12px] font-semibold px-4 py-[8px] rounded-[9px] bg-transparent"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Review list */}
          {reviews.length === 0 ? (
            <p className="text-[12px] text-slate text-center py-4">No reviews yet. Reviews can be left after a staff member completes a shift.</p>
          ) : reviews.map((r) => (
            <div key={r.id} className="py-[13px] border-b border-line last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  {/* Stars + rating */}
                  <div className="flex items-center gap-2 mb-[5px]">
                    <div className="flex gap-[2px]">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span key={s} className="text-[13px]" style={{ color: s <= Math.round(r.rating) ? '#F4A418' : '#CBD5E0' }}>★</span>
                      ))}
                    </div>
                    <span className="font-bold text-[12px] text-ink">{r.rating.toFixed(1)}</span>
                    {r.facilityName && (
                      <span className="text-[11px] text-slate">· {r.facilityName}</span>
                    )}
                  </div>
                  {/* Comment */}
                  {r.comment && (
                    <p className="text-[12px] text-ink mb-[5px]">{r.comment}</p>
                  )}
                  {/* Meta */}
                  <p className="text-[10.5px] text-slate">
                    {r.authorName ?? 'Admin'}
                    {r.shiftReference ? ` · Shift ${r.shiftReference}` : ''}
                    {' · '}{new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {activeTab === 'Notes' && (
        <Panel title="Private Notes">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Add a note…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              className="flex-1 px-3 py-[9px] border-[1.4px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-navy-2"
            />
            <button onClick={handleAddNote} className="bg-navy text-white text-[12px] font-bold px-4 py-[9px] rounded-[9px]">
              Add
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="text-[12px] text-slate text-center py-4">No notes yet.</p>
          ) : notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between py-[10px] border-b border-line last:border-0">
              <div>
                <p className="text-[12px] text-ink">{n.body}</p>
                <p className="text-[10.5px] text-slate mt-1">{n.authorName} · {new Date(n.createdAt).toLocaleDateString('en-GB')}</p>
              </div>
              <button onClick={() => handleDeleteNote(n.id)} className="text-[11px] text-urgent font-semibold hover:underline ml-4 flex-shrink-0">
                Delete
              </button>
            </div>
          ))}
        </Panel>
      )}

      {chatOpen && (
        <ChatDrawer
          staffId={staffId}
          staffName={profile.name}
          onClose={() => setChatOpen(false)}
        />
      )}
    </Layout>
  );
}
