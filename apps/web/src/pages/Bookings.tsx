import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Panel from '../components/ui/Panel';
import TabNav from '../components/ui/TabNav';
import Pagination from '../components/ui/Pagination';
import adminBookingsService, { BookingRow } from '../services/adminBookingsService';
import SortTh from '../components/ui/SortTh';
import ChatDrawer from '../components/ChatDrawer';
import DateRangePicker from '../components/ui/DateRangePicker';
import { STAFF_ROLE_OPTIONS } from '../utils/staffRoles';

const PAGE_SIZE = 25;

// Same chip style as the Shifts filter row.
const CHIP = 'bg-white border border-line rounded-sm px-[11px] py-[6px] text-[11px] font-semibold text-slate cursor-pointer inline-flex items-center gap-[6px] select-none hover:border-navy-2 transition-colors outline-none appearance-none';

const TABS = ['all', 'pending', 'confirmed', 'upcoming', 'completed', 'cancelled'];
const TAB_LABELS: Record<string, string> = {
  all: 'All', pending: 'Pending', confirmed: 'Confirmed',
  upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled',
};

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

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Bookings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [chatTarget, setChatTarget] = useState<{ staffId: number; staffName: string } | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('booked_on');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [role, setRole] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const filters = { role: role || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
  const hasFilters = !!(role || dateFrom || dateTo);

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const load = useCallback(async (tab: string, p: number) => {
    setLoading(true);
    try {
      const res = await adminBookingsService.listBookings(
        tab, undefined, PAGE_SIZE, (p - 1) * PAGE_SIZE, sortBy, sortOrder,
        { role: role || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
      );
      setBookings(res.items);
      setCounts(res.counts);
      setTotal(res.total);
    } catch {} finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder, role, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [activeTab, role, dateFrom, dateTo]);
  useEffect(() => { load(activeTab, page); }, [load, activeTab, page]);

  const tabLabels = TABS.map(t => counts[t] != null ? `${TAB_LABELS[t]} (${counts[t]})` : TAB_LABELS[t]);

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">Shift Bookings</h1>
          <p className="text-[11.5px] text-slate mb-4">{loading ? '…' : `${total} bookings`}</p>
        </div>
        <button
          onClick={() => adminBookingsService.exportCsv(activeTab, filters)}
          className="border-[1.5px] border-navy text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] bg-transparent"
        >
          ⬇ Export to CSV
        </button>
      </div>

      <TabNav
        tabs={tabLabels}
        active={tabLabels[TABS.indexOf(activeTab)]}
        onChange={(label) => {
          const idx = tabLabels.indexOf(label);
          if (idx >= 0) setActiveTab(TABS[idx]);
        }}
      />

      {/* Filter Row — role and shift date */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={CHIP}>
          <option value="">Role ▾</option>
          {STAFF_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <DateRangePicker
          value={{ dateFrom, dateTo }}
          onChange={({ dateFrom: f, dateTo: t }) => { setDateFrom(f); setDateTo(t); }}
        />
        {hasFilters && (
          <button
            onClick={() => { setRole(''); setDateFrom(''); setDateTo(''); }}
            className="text-[11px] font-semibold text-urgent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <Panel>
        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <SortTh label="Shift" column="shift" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortTh label="Doctor" column="staff" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortTh label="Booking Date" column="booked_on" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortTh label="Status" column="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center text-[12px] text-slate py-8">Loading…</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-[12px] text-slate py-8">No bookings found.</td></tr>
              ) : bookings.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.reference}</td>
                  <td>{r.shiftLabel}</td>
                  <td>{r.staffName}</td>
                  <td>{dateLabel(r.bookedOn)}</td>
                  <td><Badge label={r.displayStatus} variant={statusVariant(r.status)} /></td>
                  <td className="text-[12px]">
                    <span
                      className="text-navy-2 font-semibold cursor-pointer hover:underline"
                      onClick={() => navigate(`/bookings/${r.id}`)}
                    >View</span>
                    {['confirmed', 'upcoming', 'pending'].includes(r.status) && r.staffId && (
                      <>
                        {' · '}
                        <button
                          onClick={() => setChatTarget({ staffId: r.staffId, staffName: r.staffName })}
                          className="text-navy-2 font-semibold hover:underline"
                        >Contact</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </Panel>

      {chatTarget && (
        <ChatDrawer
          staffId={chatTarget.staffId}
          staffName={chatTarget.staffName}
          onClose={() => setChatTarget(null)}
        />
      )}
    </Layout>
  );
}
