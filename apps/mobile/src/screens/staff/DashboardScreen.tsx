import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRefresh } from '../../hooks/useRefresh';
import Screen from '../../components/ui/Screen';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { StaffTabParamList } from '../../navigation/StaffNavigator';
import userService, { DashboardResponse, ShiftItem } from '../../services/userService';
import shiftService from '../../services/shiftService';
import chatService from '../../services/chatService';
import notificationService from '../../services/notificationService';
import Toast, { ToastType } from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import { shiftDateRange } from '../../utils/shiftDates';

type DashboardNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Dashboard'>,
  BottomTabNavigationProp<StaffTabParamList>
>;

type Props = { navigation: DashboardNavProp };

function formatShiftDate(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatShiftTime(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function HospitalAvatar({ initials }: { initials: string }) {
  return (
    <View style={styles.hospitalAvatar}>
      <Text style={styles.hospitalAvatarText}>{initials}</Text>
    </View>
  );
}

function ShiftTags({ shift }: { shift: ShiftItem }) {
  const tags = [];
  if (shift.isUrgent) tags.push('Urgent');
  if (shift.isNight) tags.push('Night');
  if (shift.isWeekend) tags.push('Weekend');
  return (
    <View style={styles.metaRow}>
      {tags.map((tag) => (
        <View key={tag} style={styles.tagBadge}>
          <Text style={styles.tagBadgeText}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

function UrgentShiftCard({ item, onPress, onApply }: { item: ShiftItem; onPress: () => void; onApply: (id: number) => void }) {
  return (
    <TouchableOpacity style={styles.urgentCard} onPress={onPress} activeOpacity={0.95}>
      <View style={styles.cardTopRow}>
        <HospitalAvatar initials={item.facility?.initials || getInitials(item.facility?.name ?? '')} />
        <View style={styles.cardTopInfo}>
          <Text style={styles.hospitalName}>{item.facility?.name}</Text>
          <Text style={styles.hospitalLoc}>📍 {item.facility?.location}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaPill}><Text style={styles.metaText}>📅 {shiftDateRange(item.startTime, item.endTime, formatShiftDate)}</Text></View>
        <View style={styles.metaPill}><Text style={styles.metaText}>⏰ {formatShiftTime(item.startTime, item.endTime)}</Text></View>
      </View>

      <View style={[styles.metaRow, { marginTop: 5 }]}>
        <View style={styles.metaPill}><Text style={styles.metaText}>🩺 {item.specialty}</Text></View>
        <View style={styles.metaPill}><Text style={styles.metaText}>{item.durationHours} hrs</Text></View>
      </View>

      <ShiftTags shift={item} />

      <View style={styles.cardBottomRow}>
        <Text style={styles.shiftPay}>₹{item.payRate.toLocaleString('en-IN')}</Text>
        {item.applicationStatus ? (
          <View style={styles.appliedBadge}>
            <Text style={styles.appliedBadgeText}>{item.applicationStatus === 'confirmed' ? 'Confirmed' : 'Applied'}</Text>
          </View>
        ) : item.hasStarted ? (
          <View style={styles.startedBadge}>
            <Text style={styles.startedBadgeText}>Already started</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.applyBtn} activeOpacity={0.85} onPress={(e) => { e.stopPropagation?.(); onApply(item.id); }}>
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function RecommendedShiftCard({ item, onPress, onApply }: { item: ShiftItem; onPress: () => void; onApply: (id: number) => void }) {
  return (
    <TouchableOpacity style={styles.recCard} onPress={onPress} activeOpacity={0.95}>
      <View style={styles.cardTopRow}>
        <HospitalAvatar initials={item.facility?.initials || getInitials(item.facility?.name ?? '')} />
        <View style={styles.cardTopInfo}>
          <Text style={styles.hospitalName}>{item.facility?.name}</Text>
          <Text style={styles.hospitalLoc}>📍 {item.facility?.location}</Text>
        </View>
        <Text style={styles.shiftPay}>₹{item.payRate.toLocaleString('en-IN')}</Text>
      </View>

      <View style={[styles.metaRow, { marginTop: 4 }]}>
        <View style={styles.metaPill}><Text style={styles.metaText}>📅 {shiftDateRange(item.startTime, item.endTime, formatShiftDate)}</Text></View>
        <View style={styles.metaPill}><Text style={styles.metaText}>⏰ {formatShiftTime(item.startTime, item.endTime)}</Text></View>
        <View style={styles.metaPill}><Text style={styles.metaText}>🩺 {item.specialty}</Text></View>
        <View style={styles.metaPill}><Text style={styles.metaText}>{item.durationHours} hrs</Text></View>
      </View>

      {item.applicationStatus ? (
        <View style={[styles.applyBtn, styles.applyBtnFull, styles.appliedBadge]}>
          <Text style={styles.appliedBadgeText}>{item.applicationStatus === 'confirmed' ? 'Confirmed' : 'Applied'}</Text>
        </View>
      ) : item.hasStarted ? (
        <View style={[styles.applyBtnFull, styles.startedBadge]}>
          <Text style={styles.startedBadgeText}>Already started</Text>
        </View>
      ) : (
        <TouchableOpacity style={[styles.applyBtn, styles.applyBtnFull]} activeOpacity={0.85} onPress={(e) => { e.stopPropagation?.(); onApply(item.id); }}>
          <Text style={styles.applyBtnText}>Apply</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }: Props) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as ToastType });
  const showToast = (message: string, type: ToastType = 'error') =>
    setToast({ visible: true, message, type });

  const loadBadges = useCallback(() => {
    chatService.listMyRooms().then((rooms) => {
      const total = rooms.reduce((sum, r) => sum + r.unreadCount, 0);
      setUnreadMessages(total);
    }).catch(() => {});
    notificationService.getUnreadCount().then(setUnreadNotifCount).catch(() => {});
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await userService.getDashboard();
      setDashboard(data);
    } catch {
      showToast('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Refresh badges whenever the screen comes into focus, then poll every 30s
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useFocusEffect(
    useCallback(() => {
      loadBadges();
      pollRef.current = setInterval(loadBadges, 30_000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [loadBadges])
  );
  const { refreshing, onRefresh } = useRefresh(loadDashboard);

  const handleOpenChat = () => {
    navigation.navigate('MessagesList');
  };

  const handleApply = async (shiftId: number) => {
    try {
      await shiftService.applyToShift(shiftId);
      showToast('Application submitted!', 'success');
      loadDashboard();
    } catch (err: unknown) {
      const detail = (err as any)?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((e: any) => e.msg ?? JSON.stringify(e)).join('\n')
        : (typeof detail === 'string' ? detail : 'Could not apply. Please try again.');
      showToast(msg);
    }
  };

  const user = dashboard?.user;
  const stats = dashboard?.stats;

  const STAT_CARDS = [
    { label: 'Available Shifts', value: stats?.availableShifts ?? '—' },
    { label: 'Upcoming Shifts', value: stats?.upcomingShifts ?? '—' },
    { label: 'Completed Shifts', value: stats?.completedShifts ?? '—' },
    { label: 'Earnings this Month', value: stats != null ? `₹${stats.earningsThisMonth.toLocaleString('en-IN')}` : '—' },
  ];

  const initials = user ? getInitials(user.fullName) : '?';

  if (loading) {
    return (
      <Screen style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#0F3D5C" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F3D5C" colors={['#0F3D5C']} />}
      >
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.avatarRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarInitial}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.greeting}>{dashboard?.greeting ?? 'Hello'},</Text>
              <Text style={styles.userName}>{user?.fullName ?? ''}</Text>
            </View>
          </View>
          <View style={styles.headerIcons}>
            {/* Messages icon */}
            <View style={styles.bellWrap}>
              <TouchableOpacity style={styles.bellBtn} activeOpacity={0.8} onPress={handleOpenChat}>
                <Text style={styles.bellIcon}>💬</Text>
              </TouchableOpacity>
              {unreadMessages > 0 && (
                <View style={styles.msgBadge}>
                  <Text style={styles.msgBadgeText}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
                </View>
              )}
            </View>
            {/* Notifications bell */}
            <View style={styles.bellWrap}>
              <TouchableOpacity style={styles.bellBtn} activeOpacity={0.8} onPress={() => navigation.navigate('Notifications')}>
                <Text style={styles.bellIcon}>🔔</Text>
              </TouchableOpacity>
              {unreadNotifCount > 0 && <View style={styles.bellPing} />}
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {STAT_CARDS.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{String(stat.value)}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Urgent Shifts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Urgent Shifts Near You</Text>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Shifts')}><Text style={styles.sectionLink}>See all</Text></TouchableOpacity>
        </View>

        {(dashboard?.urgentShifts?.length ?? 0) > 0 ? (
          <FlatList
            data={dashboard?.urgentShifts}
            keyExtractor={(item) => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.urgentList}
            renderItem={({ item }) => <UrgentShiftCard item={item} onPress={() => navigation.navigate('ShiftDetails', { shiftId: item.id })} onApply={handleApply} />}
            nestedScrollEnabled
          />
        ) : (
          <EmptyState
            icon="⚡"
            title="No urgent shifts right now"
            subtitle="You're all caught up. New urgent shifts will appear here."
          />
        )}

        {/* Recommended Shifts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recommended for You</Text>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Shifts')}><Text style={styles.sectionLink}>See all</Text></TouchableOpacity>
        </View>

        {(dashboard?.recommendedShifts?.length ?? 0) > 0 ? (
          dashboard?.recommendedShifts.map((item) => (
            <RecommendedShiftCard key={item.id} item={item} onPress={() => navigation.navigate('ShiftDetails', { shiftId: item.id })} onApply={handleApply} />
          ))
        ) : (
          <EmptyState
            icon="🌟"
            title="No recommendations yet"
            subtitle="Complete your profile and set availability to get personalised shift suggestions."
            buttonLabel="Set Availability"
            onPress={() => navigation.getParent()?.navigate('Calendar')}
          />
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FA' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userAvatar: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#EAF2F8', alignItems: 'center', justifyContent: 'center',
  },
  userAvatarInitial: { fontSize: 14, fontWeight: '800', color: '#0F3D5C' },
  greeting: { fontSize: 11, color: '#5C6B7A' },
  userName: { fontSize: 14.5, fontWeight: '800', color: '#14202E' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bellWrap: { position: 'relative' },
  bellBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#DCE4EA', alignItems: 'center', justifyContent: 'center',
  },
  bellIcon: { fontSize: 14 },
  bellPing: {
    position: 'absolute', top: 5, right: 6, width: 7, height: 7,
    borderRadius: 3.5, backgroundColor: '#C0392B', borderWidth: 1.5, borderColor: '#fff',
  },
  msgBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#C0392B', borderWidth: 1.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  msgBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 10, marginBottom: 16 },
  statCard: { width: '47.5%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', borderRadius: 12, padding: 13 },
  statValue: { fontSize: 19, fontWeight: '800', color: '#0B2D45' },
  statLabel: { fontSize: 10.8, color: '#5C6B7A', marginTop: 2 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, marginTop: 18, marginBottom: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#14202E' },
  sectionLink: { fontSize: 11, color: '#175E86', fontWeight: '700' },
  emptyText: { fontSize: 12, color: '#8697A6', paddingHorizontal: 18, marginBottom: 8 },

  hospitalAvatar: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center',
    justifyContent: 'center', marginRight: 8, flexShrink: 0, backgroundColor: '#EAF2F8',
  },
  hospitalAvatarText: { fontSize: 12, fontWeight: '800', color: '#0F3D5C' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardTopInfo: { flex: 1 },

  urgentList: { paddingHorizontal: 18, paddingBottom: 6, gap: 10 },
  urgentCard: { width: 210, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', borderRadius: 12, padding: 13 },

  tagBadge: { backgroundColor: '#EAF2F8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagBadgeText: { fontSize: 10, fontWeight: '700', color: '#175E86' },

  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },

  recCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', borderRadius: 12, padding: 13, marginHorizontal: 18, marginBottom: 10 },

  applyBtn: { backgroundColor: '#0F3D5C', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 },
  applyBtnFull: { alignSelf: 'flex-end', marginTop: 10 },
  applyBtnText: { fontSize: 11.5, fontWeight: '700', color: '#fff' },
  appliedBadge: { backgroundColor: '#EAF2F8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  appliedBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#0F3D5C' },
  startedBadge: { backgroundColor: '#F0F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  startedBadgeText: { fontSize: 11.5, fontWeight: '700', color: '#5C6B7A' },

  hospitalName: { fontSize: 12.8, fontWeight: '700', color: '#14202E', marginBottom: 1 },
  hospitalLoc: { fontSize: 11, color: '#5C6B7A', marginTop: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaPill: { backgroundColor: '#F5F8FA', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  metaText: { fontSize: 10.8, color: '#5C6B7A' },
  shiftPay: { fontSize: 13.5, fontWeight: '800', color: '#0B2D45' },
});
