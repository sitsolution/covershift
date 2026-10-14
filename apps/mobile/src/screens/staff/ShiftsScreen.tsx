import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { useRefresh } from '../../hooks/useRefresh';
import Screen from '../../components/ui/Screen';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ShiftsStackParamList } from '../../navigation/ShiftsStackNavigator';
import { useFocusEffect } from '@react-navigation/native';
import shiftService from '../../services/shiftService';
import { ShiftItem } from '../../services/userService';
import { shiftDateRange } from '../../utils/shiftDates';

type Props = { navigation: NativeStackNavigationProp<ShiftsStackParamList, 'ShiftsList'> };

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function formatTime(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(start)}–${fmt(end)}`;
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ymdLabel(s: string) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

/* ─── Pay rate presets ────────────────────────────────────────────────────── */
const PAY_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Any',    value: null  },
  { label: '₹1,000+', value: 1000 },
  { label: '₹3,000+', value: 3000 },
  { label: '₹5,000+', value: 5000 },
  { label: '₹8,000+', value: 8000 },
];

const SHIFT_TYPES = ['Day', 'Night', 'Weekend', 'Urgent'];

/* ─── Mini calendar for date range ───────────────────────────────────────── */
function CalendarModal({
  visible, dateFrom, dateTo,
  onConfirm, onCancel,
}: {
  visible: boolean;
  dateFrom: string; dateTo: string;
  onConfirm: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo]     = useState(dateTo);
  const [step, setStep] = useState<'from' | 'to'>(dateFrom ? 'to' : 'from');

  useEffect(() => {
    if (visible) {
      setFrom(dateFrom); setTo(dateTo);
      setStep(dateFrom ? 'to' : 'from');
    }
  }, [visible, dateFrom, dateTo]);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function tapDay(ymd: string) {
    if (step === 'from') {
      setFrom(ymd); setTo(''); setStep('to');
    } else {
      if (from && ymd < from) { setFrom(ymd); setTo(from); }
      else { setTo(ymd); }
      setStep('from');
    }
  }

  function dayState(day: number) {
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isFrom = ymd === from;
    const isTo   = ymd === to;
    const inRange = from && to && ymd > (from < to ? from : to) && ymd < (from < to ? to : from);
    const isToday = ymd === toYMD(today);
    return { ymd, isFrom, isTo, inRange: !!inRange, isToday };
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={cal.backdrop} onPress={onCancel} />
      <View style={cal.sheet}>
        {/* Month nav */}
        <View style={cal.nav}>
          <TouchableOpacity onPress={prevMonth} style={cal.navBtn} activeOpacity={0.7}>
            <Text style={cal.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={cal.navTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={cal.navBtn} activeOpacity={0.7}>
            <Text style={cal.navArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Step hint */}
        <Text style={cal.hint}>
          {step === 'from' ? 'Tap to select start date' : 'Tap to select end date'}
        </Text>

        {/* Day headers */}
        <View style={cal.week}>
          {DAY_HEADERS.map(d => <Text key={d} style={cal.weekDay}>{d}</Text>)}
        </View>

        {/* Day grid */}
        <View style={cal.grid}>
          {Array(firstDay).fill(null).map((_, i) => <View key={`e${i}`} style={cal.cell} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const { ymd, isFrom, isTo, inRange, isToday } = dayState(i + 1);
            return (
              <TouchableOpacity
                key={ymd}
                style={[
                  cal.cell,
                  inRange && cal.cellRange,
                  (isFrom || isTo) && cal.cellSelected,
                ]}
                onPress={() => tapDay(ymd)}
                activeOpacity={0.8}
              >
                <Text style={[
                  cal.cellText,
                  isToday && cal.cellTextToday,
                  (isFrom || isTo) && cal.cellTextSelected,
                  inRange && cal.cellTextRange,
                ]}>
                  {i + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected range display */}
        {(from || to) && (
          <Text style={cal.rangeLabel}>
            {from ? ymdLabel(from) : '—'}  →  {to ? ymdLabel(to) : '—'}
          </Text>
        )}

        {/* Actions */}
        <View style={cal.actions}>
          <TouchableOpacity style={cal.btnClear} onPress={() => { setFrom(''); setTo(''); setStep('from'); }} activeOpacity={0.8}>
            <Text style={cal.btnClearText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cal.btnConfirm} onPress={() => onConfirm(from, to)} activeOpacity={0.85}>
            <Text style={cal.btnConfirmText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ─── ShiftCard ───────────────────────────────────────────────────────────── */
function ShiftCard({ item, onPress, onApply }: { item: ShiftItem; onPress: () => void; onApply: (id: number) => void }) {
  const applied   = item.applicationStatus != null;
  const confirmed = item.applicationStatus === 'confirmed';
  const started   = item.hasStarted;
  const initials  = item.facility?.initials || (item.facility?.name ?? '??').slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.96} onPress={onPress}>
      <View style={styles.hospRow}>
        <View style={styles.initials}>
          <Text style={styles.initialsText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hospName} numberOfLines={1}>{item.facility?.name}</Text>
          <Text style={styles.hospLoc} numberOfLines={1}>📍 {item.facility?.location}</Text>
        </View>
      </View>
      <View style={styles.pillRow}>
        <View style={styles.pill}><Text style={styles.pillText}>🗓 {shiftDateRange(item.startTime, item.endTime, formatDate)}</Text></View>
        <View style={styles.pill}><Text style={styles.pillText}>⏰ {formatTime(item.startTime, item.endTime)}</Text></View>
        <View style={styles.pill}><Text style={styles.pillText}>🩺 {item.specialty}</Text></View>
        <View style={styles.pill}><Text style={styles.pillText}>{item.durationHours} hrs</Text></View>
      </View>
      {(item.isUrgent || item.isNight || item.isWeekend) && (
        <View style={styles.tagsRow}>
          {item.isUrgent  && <View style={styles.tagUrgent}><Text style={styles.tagUrgentText}>Urgent</Text></View>}
          {item.isNight   && <View style={styles.tagNight}><Text style={styles.tagNightText}>Night</Text></View>}
          {item.isWeekend && <View style={styles.tagWeekend}><Text style={styles.tagWeekendText}>Weekend</Text></View>}
        </View>
      )}
      <View style={styles.cardFoot}>
        <Text style={styles.pay}>₹{item.payRate.toLocaleString('en-IN')}</Text>
        {confirmed ? (
          <View style={styles.badgeConfirmed}><Text style={styles.badgeConfirmedText}>Confirmed ✓</Text></View>
        ) : applied ? (
          <View style={styles.badgeApplied}><Text style={styles.badgeAppliedText}>Applied</Text></View>
        ) : started ? (
          <View style={styles.badgeStarted}><Text style={styles.badgeStartedText}>Already started</Text></View>
        ) : (
          <TouchableOpacity style={styles.applyBtn} onPress={() => onApply(item.id)} activeOpacity={0.85}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

type SortKey = 'date_asc' | 'date_desc' | 'pay_asc' | 'pay_desc';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_asc',  label: 'Date: Earliest First' },
  { key: 'date_desc', label: 'Date: Latest First'   },
  { key: 'pay_desc',  label: 'Pay Rate: High to Low' },
  { key: 'pay_asc',   label: 'Pay Rate: Low to High' },
];

/* ─── ShiftsScreen ────────────────────────────────────────────────────────── */
export default function ShiftsScreen({ navigation }: Props) {
  const [shifts, setShifts]   = useState<ShiftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });

  // filter options from server (role-specific)
  const [locations, setLocations]     = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // selected filter values
  const [selectedLocation, setSelectedLocation]   = useState('');
  const [selectedDept, setSelectedDept]           = useState('');
  const [selectedShiftType, setSelectedShiftType] = useState('');
  const [selectedMinPay, setSelectedMinPay]       = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  // sort
  const [sortKey, setSortKey]         = useState<SortKey>('date_asc');
  const [sortVisible, setSortVisible] = useState(false);

  // which tag-panel dropdown is open
  const [openDrop, setOpenDrop] = useState<'location' | 'dept' | 'shiftType' | 'payRate' | null>(null);
  // calendar modal
  const [calendarVisible, setCalendarVisible] = useState(false);

  const hasFilters = !!(selectedLocation || selectedDept || selectedShiftType || selectedMinPay || dateFrom || dateTo);

  const load = useCallback(async (
    s?: string, loc?: string, dept?: string,
    shiftType?: string, minPay?: number | null,
    from?: string, to?: string,
  ) => {
    setLoading(true);
    try {
      const res = await shiftService.listShifts({
        search: s || undefined,
        location: loc || undefined,
        specialty: dept || undefined,
        shiftType: shiftType || undefined,
        minPay: minPay ?? undefined,
        dateFrom: from || undefined,
        dateTo: to || undefined,
      });
      setShifts(res.items);
    } catch {
      setToast({ visible: true, message: 'Failed to load shifts.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCurrent = useCallback(
    () => load(search, selectedLocation, selectedDept, selectedShiftType, selectedMinPay, dateFrom, dateTo),
    [load, search, selectedLocation, selectedDept, selectedShiftType, selectedMinPay, dateFrom, dateTo],
  );

  const { refreshing, onRefresh } = useRefresh(loadCurrent);

  useEffect(() => {
    // role-specific locations + departments from backend
    shiftService.getFilters().then(f => {
      setLocations(f.locations);
      setDepartments(f.specialties);
    }).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { loadCurrent(); }, [loadCurrent]));

  const handleSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(
      () => load(text || undefined, selectedLocation, selectedDept, selectedShiftType, selectedMinPay, dateFrom, dateTo),
      500,
    );
    setSearchTimeout(t);
  };

  function selectFromDrop(val: string) {
    const empty = val === '';
    if (openDrop === 'location') {
      const v = empty ? '' : val;
      setSelectedLocation(v);
      load(search, v, selectedDept, selectedShiftType, selectedMinPay, dateFrom, dateTo);
    } else if (openDrop === 'dept') {
      const v = empty ? '' : val;
      setSelectedDept(v);
      load(search, selectedLocation, v, selectedShiftType, selectedMinPay, dateFrom, dateTo);
    } else if (openDrop === 'shiftType') {
      const v = empty ? '' : val;
      setSelectedShiftType(v);
      load(search, selectedLocation, selectedDept, v, selectedMinPay, dateFrom, dateTo);
    } else if (openDrop === 'payRate') {
      const preset = PAY_PRESETS.find(p => p.label === val);
      const pay = preset?.value ?? null;
      setSelectedMinPay(pay);
      load(search, selectedLocation, selectedDept, selectedShiftType, pay, dateFrom, dateTo);
    }
    setOpenDrop(null);
  }

  function clearFilters() {
    setSelectedLocation(''); setSelectedDept('');
    setSelectedShiftType(''); setSelectedMinPay(null);
    setDateFrom(''); setDateTo('');
    setOpenDrop(null);
    load(search);
  }

  function dropItems(): string[] {
    if (openDrop === 'location')  return ['', ...locations];
    if (openDrop === 'dept')      return ['', ...departments];
    if (openDrop === 'shiftType') return ['', ...SHIFT_TYPES];
    if (openDrop === 'payRate')   return PAY_PRESETS.map(p => p.label);
    return [];
  }
  function dropSelected(): string {
    if (openDrop === 'location')  return selectedLocation;
    if (openDrop === 'dept')      return selectedDept;
    if (openDrop === 'shiftType') return selectedShiftType;
    if (openDrop === 'payRate')   return PAY_PRESETS.find(p => p.value === selectedMinPay)?.label ?? 'Any';
    return '';
  }

  // client-side sort of loaded shifts
  const sortedShifts = useMemo(() => {
    const arr = [...shifts];
    if (sortKey === 'date_asc')  arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (sortKey === 'date_desc') arr.sort((a, b) => b.startTime.localeCompare(a.startTime));
    if (sortKey === 'pay_desc')  arr.sort((a, b) => b.payRate - a.payRate);
    if (sortKey === 'pay_asc')   arr.sort((a, b) => a.payRate - b.payRate);
    return arr;
  }, [shifts, sortKey]);

  // chip label helpers
  const dateLabel = dateFrom && dateTo
    ? `${ymdLabel(dateFrom)}–${ymdLabel(dateTo)}`
    : dateFrom ? `From ${ymdLabel(dateFrom)}` : 'Date Range';
  const payLabel = selectedMinPay
    ? PAY_PRESETS.find(p => p.value === selectedMinPay)?.label ?? 'Pay Rate'
    : 'Pay Rate';

  return (
    <Screen style={styles.screen}>
      {/* Appbar */}
      <View style={styles.appbar}>
        <Text style={styles.appbarTitle}>Available Shifts</Text>
        <TouchableOpacity
          style={styles.myAppsBtn}
          onPress={() => navigation.navigate('MyApplications')}
          activeOpacity={0.8}
        >
          <Text style={styles.myAppsBtnText}>My Applications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setSortVisible(true)} activeOpacity={0.8}>
          <Text style={styles.sortBtnIcon}>⇅</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search by location, role, date"
          placeholderTextColor="#A9B8C4"
          value={search}
          onChangeText={handleSearchChange}
        />
      </View>

      {/* Filter chips — fixed-height wrapper breaks Android flex overflow clipping */}
      <View style={styles.filterScroll}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {/* Location */}
        <TouchableOpacity
          style={[styles.filterChip, (selectedLocation || openDrop === 'location') && styles.filterChipActive]}
          onPress={() => { setCalendarVisible(false); setOpenDrop(p => p === 'location' ? null : 'location'); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, (selectedLocation || openDrop === 'location') && styles.filterChipTextActive]} numberOfLines={1}>
            {selectedLocation || 'Location'} ▾
          </Text>
        </TouchableOpacity>

        {/* Department */}
        <TouchableOpacity
          style={[styles.filterChip, (selectedDept || openDrop === 'dept') && styles.filterChipActive]}
          onPress={() => { setCalendarVisible(false); setOpenDrop(p => p === 'dept' ? null : 'dept'); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, (selectedDept || openDrop === 'dept') && styles.filterChipTextActive]} numberOfLines={1}>
            {selectedDept || 'Department'} ▾
          </Text>
        </TouchableOpacity>

        {/* Date Range */}
        <TouchableOpacity
          style={[styles.filterChip, (dateFrom || dateTo) && styles.filterChipActive]}
          onPress={() => { setOpenDrop(null); setCalendarVisible(true); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, (dateFrom || dateTo) && styles.filterChipTextActive]} numberOfLines={1}>
            {dateLabel} ▾
          </Text>
        </TouchableOpacity>

        {/* Shift Type */}
        <TouchableOpacity
          style={[styles.filterChip, (selectedShiftType || openDrop === 'shiftType') && styles.filterChipActive]}
          onPress={() => { setCalendarVisible(false); setOpenDrop(p => p === 'shiftType' ? null : 'shiftType'); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, (selectedShiftType || openDrop === 'shiftType') && styles.filterChipTextActive]} numberOfLines={1}>
            {selectedShiftType || 'Shift Type'} ▾
          </Text>
        </TouchableOpacity>

        {/* Pay Rate */}
        <TouchableOpacity
          style={[styles.filterChip, (selectedMinPay != null || openDrop === 'payRate') && styles.filterChipActive]}
          onPress={() => { setCalendarVisible(false); setOpenDrop(p => p === 'payRate' ? null : 'payRate'); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, (selectedMinPay != null || openDrop === 'payRate') && styles.filterChipTextActive]} numberOfLines={1}>
            {payLabel} ▾
          </Text>
        </TouchableOpacity>

        {hasFilters && (
          <TouchableOpacity style={styles.clearChip} onPress={clearFilters} activeOpacity={0.8}>
            <Text style={styles.clearChipText} numberOfLines={1}>✕ Clear</Text>
          </TouchableOpacity>
        )}

        {/* Trailing spacer — Android clips paddingRight in ScrollView contentContainerStyle */}
        <View style={{ width: 18 }} />
      </ScrollView>
      </View>

      {/* Tag dropdown panel */}
      {openDrop && (
        <View style={styles.tagPanel}>
          <View style={styles.tagGrid}>
            {dropItems().map((val) => (
              <TouchableOpacity
                key={val || '__all'}
                style={[styles.tag, dropSelected() === val && styles.tagActive]}
                onPress={() => selectFromDrop(val)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tagText, dropSelected() === val && styles.tagTextActive]}>
                  {val || 'All'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Shift list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        onScrollBeginDrag={() => setOpenDrop(null)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F3D5C" colors={['#0F3D5C']} />}
      >
        {loading ? (
          <ActivityIndicator color="#0F3D5C" style={{ marginTop: 40 }} />
        ) : shifts.length === 0 ? (
          <EmptyState
            icon="🩺"
            title={search || hasFilters ? 'No shifts match your filters' : 'No shifts available'}
            subtitle={search || hasFilters ? 'Try different filters or clear them.' : 'Check back soon — new shifts are posted regularly.'}
          />
        ) : (
          sortedShifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              item={shift}
              onPress={() => navigation.navigate('ShiftDetails', { shiftId: shift.id })}
              onApply={handleApply}
            />
          ))
        )}
      </ScrollView>

      {/* Date Range Calendar Modal */}
      <CalendarModal
        visible={calendarVisible}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onConfirm={(from, to) => {
          setDateFrom(from); setDateTo(to);
          setCalendarVisible(false);
          load(search, selectedLocation, selectedDept, selectedShiftType, selectedMinPay, from, to);
        }}
        onCancel={() => setCalendarVisible(false)}
      />

      {/* Sort bottom sheet */}
      <Modal visible={sortVisible} transparent animationType="slide" onRequestClose={() => setSortVisible(false)}>
        <Pressable style={cal.backdrop} onPress={() => setSortVisible(false)} />
        <View style={cal.sheet}>
          <Text style={styles.sortSheetTitle}>Sort Shifts</Text>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortOption, sortKey === opt.key && styles.sortOptionActive]}
              onPress={() => { setSortKey(opt.key); setSortVisible(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortOptionText, sortKey === opt.key && styles.sortOptionTextActive]}>
                {opt.label}
              </Text>
              {sortKey === opt.key && <Text style={styles.sortCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </Screen>
  );

  async function handleApply(shiftId: number) {
    try {
      await shiftService.applyToShift(shiftId);
      setToast({ visible: true, message: 'Application submitted!', type: 'success' });
      loadCurrent();
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.detail ?? 'Could not apply. Please try again.';
      setToast({ visible: true, message: msg, type: 'error' });
    }
  }
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EEF3F8' },

  appbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
  },
  appbarTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#14202E' },
  myAppsBtn: {
    backgroundColor: '#EAF2F8', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 8,
  },
  myAppsBtnText: { fontSize: 12, fontWeight: '700', color: '#0F3D5C' },
  sortBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#DCE4EA',
    alignItems: 'center', justifyContent: 'center',
  },
  sortBtnIcon: { fontSize: 16, color: '#0F3D5C', fontWeight: '700' },
  sortSheetTitle: { fontSize: 14, fontWeight: '800', color: '#14202E', marginBottom: 14 },
  sortOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0F5F9',
  },
  sortOptionActive: {},
  sortOptionText: { fontSize: 13, fontWeight: '600', color: '#5C6B7A' },
  sortOptionTextActive: { color: '#0F3D5C', fontWeight: '700' },
  sortCheck: { fontSize: 14, color: '#0F3D5C', fontWeight: '800' },

  searchWrap: { paddingHorizontal: 18, marginBottom: 10 },
  searchInput: {
    backgroundColor: '#fff', borderWidth: 1.4, borderColor: '#DCE4EA',
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 13, color: '#14202E',
  },

  filterScroll: { height: 40, marginBottom: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 8 },
  filterChip: {
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.4, borderColor: '#DCE4EA',
  },
  filterChipActive: { backgroundColor: '#0F3D5C', borderColor: '#0F3D5C' },
  filterChipText: { fontSize: 12.5, fontWeight: '600', color: '#5C6B7A' },
  filterChipTextActive: { color: '#fff' },
  clearChip: { backgroundColor: '#FDECEA', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  clearChipText: { fontSize: 12.5, fontWeight: '700', color: '#C0392B' },

  tagPanel: {
    backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#E2EAF0', paddingHorizontal: 18, paddingVertical: 12, marginBottom: 4,
  },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    borderWidth: 1.4, borderColor: '#DCE4EA', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#F5F8FA',
  },
  tagActive: { backgroundColor: '#0F3D5C', borderColor: '#0F3D5C' },
  tagText: { fontSize: 12.5, fontWeight: '600', color: '#5C6B7A' },
  tagTextActive: { color: '#fff' },

  list: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#E2EAF0',
    shadowColor: '#0F3D5C', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  hospRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  initials: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#EEF3F8',
    alignItems: 'center', justifyContent: 'center',
  },
  initialsText: { fontSize: 13, fontWeight: '800', color: '#0F3D5C' },
  hospName: { fontSize: 14, fontWeight: '700', color: '#14202E', marginBottom: 2 },
  hospLoc: { fontSize: 11.5, color: '#5C6B7A' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: { backgroundColor: '#F0F5F9', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 11.5, color: '#5C6B7A', fontWeight: '500' },

  tagsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tagUrgent: { backgroundColor: '#FEF0EE', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  tagUrgentText: { fontSize: 11.5, fontWeight: '700', color: '#C0392B' },
  tagNight: { backgroundColor: '#EEF0FE', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  tagNightText: { fontSize: 11.5, fontWeight: '700', color: '#3B5BDB' },
  tagWeekend: { backgroundColor: '#F0FEF4', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  tagWeekendText: { fontSize: 11.5, fontWeight: '700', color: '#1F8A5F' },

  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  pay: { fontSize: 16, fontWeight: '800', color: '#0B2D45' },
  applyBtn: { backgroundColor: '#0F3D5C', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9 },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  badgeApplied: { backgroundColor: '#FBF0E0', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  badgeAppliedText: { fontSize: 12, fontWeight: '700', color: '#C97A2B' },
  badgeStarted: { backgroundColor: '#F0F5F9', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  badgeStartedText: { fontSize: 12, fontWeight: '700', color: '#5C6B7A' },
  badgeConfirmed: { backgroundColor: '#E3F5EC', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  badgeConfirmedText: { fontSize: 12, fontWeight: '700', color: '#1F8A5F' },
});

/* ─── Calendar modal styles ───────────────────────────────────────────────── */
const cal = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(11,45,69,0.45)',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
  },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF2F8', alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, fontWeight: '700', color: '#0F3D5C' },
  navTitle: { fontSize: 14, fontWeight: '800', color: '#14202E' },

  hint: { fontSize: 11, color: '#8697A6', textAlign: 'center', marginBottom: 12 },

  week: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: '#8697A6' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285%', height: 40, alignItems: 'center', justifyContent: 'center' },
  cellSelected: { backgroundColor: '#0F3D5C', borderRadius: 20, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  cellRange: { backgroundColor: '#EAF2F8' },
  cellText: { fontSize: 13, color: '#14202E' },
  cellTextToday: { fontWeight: '800', color: '#0F3D5C' },
  cellTextSelected: { color: '#fff', fontWeight: '800' },
  cellTextRange: { color: '#0F3D5C' },

  rangeLabel: {
    textAlign: 'center', fontSize: 12.5, fontWeight: '700',
    color: '#0F3D5C', marginTop: 14, marginBottom: 4,
  },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnClear: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#DCE4EA', alignItems: 'center',
  },
  btnClearText: { fontSize: 13, fontWeight: '700', color: '#5C6B7A' },
  btnConfirm: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#0F3D5C', alignItems: 'center',
  },
  btnConfirmText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
