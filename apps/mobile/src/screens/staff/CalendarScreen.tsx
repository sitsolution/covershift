import React, { useCallback, useEffect, useState } from 'react';
import Toast from '../../components/ui/Toast';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import Screen from '../../components/ui/Screen';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarStackParamList } from '../../navigation/CalendarStackNavigator';
import calendarService, { CalendarDay } from '../../services/calendarService';
import { ShiftItem } from '../../services/userService';
import { useFocusEffect } from '@react-navigation/native';
import { shiftDateRange } from '../../utils/shiftDates';

type Props = {
  navigation: NativeStackNavigationProp<CalendarStackParamList, 'CalendarMain'>;
};

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DAY_LABELS = ['S','M','T','W','T','F','S'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function buildCells(year: number, month: number): (number | null)[] {
  const offset = firstDayOfMonth(year, month);
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type DotColor = 'g' | 'y' | 'gr';

function markerToDot(marker: string): DotColor {
  if (marker === 'confirmed') return 'g';
  if (marker === 'pending') return 'y';
  return 'gr';
}

function shiftTimeLabel(shift: ShiftItem): string {
  const start = new Date(shift.startTime);
  const end = new Date(shift.endTime);
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)} · ${shift.specialty}`;
}

function shiftDateLabel(shift: ShiftItem): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${shift.facility?.name ?? '—'} · ${shiftDateRange(shift.startTime, shift.endTime, fmt)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DotIndicator({ type }: { type: DotColor }) {
  const bg = type === 'g' ? '#1F8A5F' : type === 'y' ? '#C97A2B' : '#8697A6';
  return <View style={[styles.dot, { backgroundColor: bg }]} />;
}

type DayCellProps = {
  day: number | null;
  isToday: boolean;
  isSelected: boolean;
  mark?: DotColor;
  cellSize: number;
  onPress: (day: number) => void;
};

function DayCell({ day, isToday, isSelected, mark, cellSize, onPress }: DayCellProps) {
  const sizeStyle = { width: cellSize, height: cellSize };
  if (day === null) return <View style={sizeStyle} />;
  return (
    <TouchableOpacity
      style={[styles.cell, sizeStyle, isToday && styles.cellToday, isSelected && styles.cellSelected]}
      activeOpacity={0.7}
      onPress={() => onPress(day)}
    >
      <Text style={[styles.cellText, (isToday || isSelected) && styles.cellTextToday]}>{day}</Text>
      {mark ? <DotIndicator type={mark} /> : null}
    </TouchableOpacity>
  );
}

function ShiftListRow({ item }: { item: ShiftItem }) {
  const isConfirmed = item.applicationStatus === 'confirmed';
  return (
    <View style={styles.listRow}>
      <View style={styles.listAvatar}>
        <Text style={styles.listAvatarText}>{item.facility?.initials || (item.facility?.name ?? '??').slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.listInfo}>
        <Text style={styles.listTitle}>{shiftDateLabel(item)}</Text>
        <Text style={styles.listSub}>{shiftTimeLabel(item)}</Text>
      </View>
      <View style={[styles.badge, isConfirmed ? styles.badgeSuccess : styles.badgeWarning]}>
        <Text style={[styles.badgeText, isConfirmed ? styles.badgeSuccessText : styles.badgeWarningText]}>
          {isConfirmed ? 'Confirmed' : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CalendarScreen({ navigation }: Props) {
  const { width: SCREEN_W } = useWindowDimensions();
  const CELL_SIZE = Math.floor((SCREEN_W - 36 - 30) / 7);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [marks, setMarks] = useState<Record<number, DotColor>>({});
  const [upcoming, setUpcoming] = useState<ShiftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dayShifts, setDayShifts] = useState<ShiftItem[] | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '' });

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await calendarService.getCalendar(y, m + 1); // API is 1-indexed
      const markMap: Record<number, DotColor> = {};
      res.days.forEach((cd: CalendarDay) => {
        const day = new Date(cd.day).getDate();
        markMap[day] = markerToDot(cd.marker);
      });
      setMarks(markMap);
      setUpcoming(res.upcoming);
    } catch {
      setToast({ visible: true, message: 'Failed to load calendar. Pull down to retry.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(year, month); }, [load, year, month]));

  const handleDayPress = async (day: number) => {
    // Tap same day again → deselect
    if (day === selectedDay) {
      setSelectedDay(null);
      setDayShifts(null);
      return;
    }
    setSelectedDay(day);
    setDayShifts(null);
    setDayLoading(true);
    try {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const res = await calendarService.getDay(`${year}-${mm}-${dd}`);
      setDayShifts(res.shifts);
    } catch {
      setToast({ visible: true, message: 'Could not load shifts for this date.' });
      setSelectedDay(null);
    } finally {
      setDayLoading(false);
    }
  };

  const cells = buildCells(year, month);
  const todayDay = today.getFullYear() === year && today.getMonth() === month ? today.getDate() : -1;

  const goPrev = () => {
    setSelectedDay(null);
    setDayShifts(null);
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const goNext = () => {
    setSelectedDay(null);
    setDayShifts(null);
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  return (
    <Screen style={styles.container}>
      {/* App Bar */}
      <View style={styles.appbar}>
        <Text style={styles.appbarTitle}>Calendar</Text>
        <View style={styles.spacer} />
        <TouchableOpacity
          style={styles.iconBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('SetAvailability')}
        >
          <Text style={styles.iconBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Month navigation */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={goPrev} style={styles.arrowBtn} activeOpacity={0.7}>
            <Text style={styles.monthArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
          <TouchableOpacity onPress={goNext} style={styles.arrowBtn} activeOpacity={0.7}>
            <Text style={styles.monthArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day label headers */}
        <View style={styles.dayLabelRow}>
          {DAY_LABELS.map((d, i) => (
            <Text key={i} style={[styles.dayLabel, { width: CELL_SIZE }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        {loading ? (
          <ActivityIndicator color="#0F3D5C" style={{ marginVertical: 40 }} />
        ) : (
          <View style={styles.calGrid}>
            {cells.map((day, i) => (
              <DayCell
                key={i}
                day={day}
                isToday={day === todayDay}
                isSelected={day === selectedDay}
                mark={day ? marks[day] : undefined}
                cellSize={CELL_SIZE}
                onPress={handleDayPress}
              />
            ))}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legendRow}>
          <Text style={styles.legendText}>🟢 Confirmed</Text>
          <Text style={styles.legendText}>🟡 Pending</Text>
          <Text style={styles.legendText}>⚪ Available</Text>
        </View>

        {/* Shifts section — filters by selected day, falls back to all upcoming */}
        {selectedDay ? (
          <>
            <Text style={styles.sectionTitle}>
              {MONTH_NAMES[month]} {selectedDay}
            </Text>
            {dayLoading ? (
              <ActivityIndicator color="#0F3D5C" style={{ marginVertical: 16 }} />
            ) : dayShifts && dayShifts.length > 0 ? (
              dayShifts.map((item) => <ShiftListRow key={item.id} item={item} />)
            ) : (
              <Text style={styles.emptyText}>No shifts on this date.</Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Upcoming Shifts</Text>
            {upcoming.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming shifts.</Text>
            ) : (
              upcoming.map((item) => <ShiftListRow key={item.id} item={item} />)
            )}
          </>
        )}
      </ScrollView>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type="error"
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </Screen>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FA' },

  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
  },
  appbarTitle: { fontSize: 16.5, fontWeight: '800', color: '#14202E' },
  spacer: { flex: 1 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DCE4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18, color: '#0F3D5C', fontWeight: '400', lineHeight: 22 },

  body: { paddingHorizontal: 18, paddingBottom: 20 },

  // Month nav
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  monthArrow: { fontSize: 20, color: '#14202E', fontWeight: '600' },
  monthLabel: { fontSize: 13, fontWeight: '800', color: '#14202E' },

  // Day labels
  dayLabelRow: { flexDirection: 'row', marginBottom: 6 },
  dayLabel: { textAlign: 'center', fontSize: 9.5, color: '#5C6B7A' },

  // Calendar grid
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 18,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DCE4EA',
  },
  cellToday: { backgroundColor: '#0F3D5C', borderColor: '#0F3D5C' },
  cellSelected: { backgroundColor: '#175E86', borderColor: '#175E86' },
  cellText: { fontSize: 11, color: '#14202E' },
  cellTextToday: { color: '#fff', fontWeight: '800' },

  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },

  // Legend
  legendRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  legendText: { fontSize: 10, color: '#5C6B7A' },

  // Section title
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#14202E', marginBottom: 10 },

  emptyText: { fontSize: 12, color: '#8697A6', textAlign: 'center', paddingVertical: 14 },

  // Shift list
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4EA',
  },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAF2F8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listAvatarText: { fontSize: 12, fontWeight: '800', color: '#0F3D5C' },
  listInfo: { flex: 1 },
  listTitle: { fontSize: 12.5, fontWeight: '700', color: '#14202E' },
  listSub: { fontSize: 11, color: '#5C6B7A', marginTop: 1 },

  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, flexShrink: 0 },
  badgeSuccess: { backgroundColor: '#E3F5EC' },
  badgeWarning: { backgroundColor: '#FBECDC' },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  badgeSuccessText: { color: '#1F8A5F' },
  badgeWarningText: { color: '#C97A2B' },
});
