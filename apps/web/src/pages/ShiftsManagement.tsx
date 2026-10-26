import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import Panel from '../components/ui/Panel';
import Pagination from '../components/ui/Pagination';
import adminShiftsService, { AdminShiftRow } from '../services/adminShiftsService';
import SortTh from '../components/ui/SortTh';
import DateRangePicker from '../components/ui/DateRangePicker';
import { STAFF_ROLE_OPTIONS } from '../utils/staffRoles';
import { shiftDateRange } from '../utils/shiftDates';

const PAGE_SIZE = 25;

type BadgeVariant = 'success' | 'warning' | 'urgent' | 'neutral' | 'info';

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

function shiftTimeRange(start: string, end: string): string {
  const fmt = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(start)}–${fmt(end)}`;
}

const CHIP = 'bg-white border border-line rounded-sm px-[11px] py-[6px] text-[11px] font-semibold text-slate cursor-pointer inline-flex items-center gap-[6px] select-none hover:border-navy-2 transition-colors outline-none appearance-none';

export default function ShiftsManagement() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<AdminShiftRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [role, setRole] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminShiftsService.listShifts({
        search: search || undefined,
        status: status || undefined,
        location: location || undefined,
        specialty: specialty || undefined,
        role: role || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: PAGE_SIZE,
        offset: (p - 1) * PAGE_SIZE,
        sortBy,
        sortOrder,
      });
      setShifts(res.items);
      setTotal(res.total);
    } catch {
      setError('Failed to load shifts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [search, status, location, specialty, role, dateFrom, dateTo, page, sortBy, sortOrder]);

  // reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, status, location, specialty, role, dateFrom, dateTo]);

  // debounce search + reload
  useEffect(() => {
    const t = setTimeout(() => load(page), 400);
    return () => clearTimeout(t);
  }, [load, page]);

  const hasFilters = search || status || location || specialty || role || dateFrom || dateTo;

  return (
    <Layout>
      {error && (
        <div className="mb-4 px-3 py-[9px] bg-urgent-bg border border-urgent rounded-[8px] text-[11.5px] text-urgent font-semibold">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">Shift Management</h1>
          <p className="text-[11.5px] text-slate mb-4">{loading ? '…' : `${total} shifts`}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/calendar" className="border-[1.5px] border-navy text-navy text-[11.5px] font-bold px-3 py-[7px] rounded-[8px] bg-transparent">
            📅 Calendar View
          </Link>
          <button onClick={() => navigate('/shifts/new')} className="bg-navy text-white text-[11.5px] font-bold px-3 py-[7px] rounded-[8px]">
            + Create New Shift
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search shifts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-[7px] border-[1.4px] border-line rounded-[9px] text-[11.5px] text-ink outline-none focus:border-navy-2 bg-white min-w-[200px]"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={CHIP}>
          <option value="">Status ▾</option>
          {['open', 'pending', 'filled', 'completed', 'cancelled', 'draft'].map((o) => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={CHIP}>
          <option value="">Role ▾</option>
          {STAFF_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={CHIP}>
          <option value="">Specialty ▾</option>
          {['Emergency Medicine', 'General Medicine', 'Pediatrics', 'Anaesthesia'].map((o) => <option key={o}>{o}</option>)}
        </select>
        <input
          type="text"
          placeholder="Location…"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="px-3 py-[7px] border-[1.4px] border-line rounded-[9px] text-[11.5px] text-ink outline-none focus:border-navy-2 bg-white min-w-[140px]"
        />
        <DateRangePicker
          value={{ dateFrom, dateTo }}
          onChange={({ dateFrom: f, dateTo: t }) => { setDateFrom(f); setDateTo(t); }}
        />
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setStatus(''); setLocation(''); setSpecialty(''); setRole(''); setDateFrom(''); setDateTo(''); }}
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
                <th>Shift ID</th>
                <SortTh label="Date" column="date" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th>Time</th>
                <SortTh label="Location" column="location" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortTh label="Specialty" column="specialty" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortTh label="Status" column="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th>Assigned Staff Member</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center text-[12px] text-slate py-8">Loading…</td></tr>
              ) : shifts.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-[12px] text-slate py-8">No shifts match your filters.</td></tr>
              ) : shifts.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="font-semibold">{s.reference}</span>
                    {s.title && <p className="text-[10.5px] text-slate mt-[1px]">{s.title}</p>}
                  </td>
                  <td>{shiftDateRange(s.startTime, s.endTime)}</td>
                  <td>{shiftTimeRange(s.startTime, s.endTime)}</td>
                  <td>{s.location}</td>
                  <td>{s.specialty}</td>
                  <td><Badge label={s.displayStatus} variant={statusVariant(s.status)} /></td>
                  <td className={s.assignedStaff.length === 0 ? 'text-slate' : ''}>
                    {s.assignedStaff.length > 0 ? s.assignedStaff.join(', ') : '—'}
                  </td>
                  <td className="text-[12px]">
                    <Link to={`/shifts/${s.id}`} className="text-navy-2 font-semibold hover:underline">View</Link>
                    {s.status === 'open' || s.status === 'pending' ? (
                      <> · <Link to={`/shifts/${s.id}`} className="text-navy-2 font-semibold hover:underline">Assign</Link></>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </Panel>
    </Layout>
  );
}
