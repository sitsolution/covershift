import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRefresh } from '../../hooks/useRefresh';
import Screen from '../../components/ui/Screen';
import Toast from '../../components/ui/Toast';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShiftsStackParamList } from '../../navigation/ShiftsStackNavigator';
import applicationService, { ApplicationOut, ApplicationCounts } from '../../services/applicationService';
import earningsService from '../../services/earningsService';
import { shiftDateRange } from '../../utils/shiftDates';

type Props = NativeStackScreenProps<ShiftsStackParamList, 'MyApplications'>;

type TabKey = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
const TABS: TabKey[] = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const TAB_API: Record<TabKey, 'pending' | 'confirmed' | 'completed' | 'cancelled'> = {
  Pending: 'pending', Confirmed: 'confirmed', Completed: 'completed', Cancelled: 'cancelled',
};

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function formatTime(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
}

function AppCard({ item, tab, onCancel, onViewDetails, onPaymentReceived }: { item: ApplicationOut; tab: TabKey; onCancel: (id: number) => void; onViewDetails: (shiftId: number) => void; onPaymentReceived: (paymentId: number) => void }) {
  const badgeStyle =
    tab === 'Confirmed' ? { bg: '#E3F5EC', color: '#1F8A5F' } :
    tab === 'Completed' ? { bg: '#EAF2F8', color: '#175E86' } :
    tab === 'Cancelled' ? { bg: '#FBE7E4', color: '#C0392B' } :
    { bg: '#FBECDC', color: '#C97A2B' };

  const shift = item.shift;
  if (!shift) return null;

  return (
    <View style={styles.card}>
      <View style={styles.cardRow1}>
        <View style={styles.hosp}>
          <View style={styles.logoChip}>
            <Text style={styles.logoChipText}>{shift.facility?.initials || (shift.facility?.name ?? '??').slice(0, 2).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.hname}>{shift.facility?.name}</Text>
            <Text style={styles.hloc}>{shift.facility?.location}</Text>
          </View>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeStyle.bg }]}>
          <Text style={[styles.badgeText, { color: badgeStyle.color }]}>
            {tab === 'Pending' ? 'Applied' : tab}
          </Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaPill}>📅 {shiftDateRange(shift.startTime, shift.endTime, formatDate)}</Text>
        <Text style={styles.metaPill}>⏰ {formatTime(shift.startTime, shift.endTime)}</Text>
        <Text style={styles.metaPill}>💊 {shift.specialty}</Text>
        <Text style={styles.metaPill}>⏱ {shift.durationHours} hrs</Text>
      </View>

      <View style={styles.cardFoot}>
        <Text style={styles.pay}>₹{shift.payRate.toLocaleString('en-IN')}</Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.outlineBtn} activeOpacity={0.8} onPress={() => onViewDetails(shift.id)}>
          <Text style={styles.outlineBtnText}>View Details</Text>
        </TouchableOpacity>
        {tab === 'Pending' && item.canCancel && (
          <TouchableOpacity style={styles.dangerBtn} activeOpacity={0.8} onPress={() => onCancel(item.id)}>
            <Text style={styles.dangerBtnText}>Cancel Application</Text>
          </TouchableOpacity>
        )}
      </View>
      {tab === 'Completed' && item.paymentStatus === 'paid' && item.paymentId && (
        <TouchableOpacity style={styles.paymentReceivedBtn} activeOpacity={0.8} onPress={() => onPaymentReceived(item.paymentId!)}>
          <Text style={styles.paymentReceivedBtnText}>💰 Payment Received</Text>
        </TouchableOpacity>
      )}
      {tab === 'Completed' && item.paymentStatus === 'processing' && (
        <View style={styles.paymentAcknowledged}>
          <Text style={styles.paymentAcknowledgedText}>✓ Payment Acknowledged</Text>
        </View>
      )}
    </View>
  );
}

export default function MyApplicationsScreen({ navigation, route }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(route.params?.initialTab ?? 'Pending');
  const [items, setItems] = useState<ApplicationOut[]>([]);
  const [counts, setCounts] = useState<ApplicationCounts>({ pending: 0, confirmed: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });
  const [cancelModal, setCancelModal] = useState<{ visible: boolean; appId: number | null }>({ visible: false, appId: null });

  const load = useCallback(async (tab: TabKey) => {
    setLoading(true);
    try {
      const res = await applicationService.listApplications(TAB_API[tab]);
      setItems(res.items);
      setCounts(res.counts);
    } catch {
      setToast({ visible: true, message: 'Failed to load applications.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(activeTab); }, [load, activeTab]);
  const loadCurrent = useCallback(() => load(activeTab), [load, activeTab]);
  const { refreshing, onRefresh } = useRefresh(loadCurrent);

  const handleCancel = (id: number) => {
    setCancelModal({ visible: true, appId: id });
  };

  const confirmCancel = async () => {
    const id = cancelModal.appId;
    setCancelModal({ visible: false, appId: null });
    if (!id) return;
    try {
      await applicationService.cancelApplication(id);
      load(activeTab);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not cancel application.';
      setToast({ visible: true, message: msg, type: 'error' });
    }
  };

  const handleViewDetails = (shiftId: number) => {
    navigation.navigate('ShiftDetails', { shiftId });
  };

  const handlePaymentReceived = async (paymentId: number) => {
    try {
      await earningsService.acknowledgePayment(paymentId);
      setItems(prev => prev.map(item =>
        item.paymentId === paymentId ? { ...item, paymentStatus: 'processing' } : item
      ));
      setToast({ visible: true, message: 'Payment acknowledged. Thank you!', type: 'success' });
    } catch {
      setToast({ visible: true, message: 'Failed to acknowledge payment.', type: 'error' });
    }
  };

  const tabCount = (tab: TabKey): number => {
    const map: Record<TabKey, number> = {
      Pending: counts.pending, Confirmed: counts.confirmed,
      Completed: counts.completed, Cancelled: counts.cancelled,
    };
    return map[tab];
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.appbarTitle}>My Applications</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F3D5C" colors={['#0F3D5C']} />}>
        <View style={styles.segmented}>
          {TABS.map((tab) => {
            const active = activeTab === tab;
            const count = tabCount(tab);
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.seg, active && styles.segActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segText, active && styles.segTextActive]}>
                  {tab}{count > 0 ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color="#0F3D5C" style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No {activeTab} applications</Text>
            <Text style={styles.emptySub}>Your {activeTab.toLowerCase()} applications will appear here.</Text>
          </View>
        ) : (
          items.map((item) => (
            <AppCard key={item.id} item={item} tab={activeTab} onCancel={handleCancel} onViewDetails={handleViewDetails} onPaymentReceived={handlePaymentReceived} />
          ))
        )}
      </ScrollView>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
      <ConfirmModal
        visible={cancelModal.visible}
        title="Cancel Application?"
        description="Are you sure you want to cancel this application? This action cannot be undone."
        confirmLabel="Yes, Cancel Application"
        dismissLabel="Keep Application"
        confirmVariant="danger"
        onConfirm={confirmCancel}
        onDismiss={() => setCancelModal({ visible: false, appId: null })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FA' },
  appbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  backBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F3D5C', lineHeight: 22 },
  appbarTitle: { fontSize: 16.5, fontWeight: '800', color: '#14202E' },
  spacer: { flex: 1 },
  body: { paddingHorizontal: 18, paddingBottom: 24 },
  segmented: { flexDirection: 'row', backgroundColor: '#EAF2F8', borderRadius: 10, padding: 3, marginBottom: 14 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  segActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { fontSize: 10, fontWeight: '700', color: '#175E86' },
  segTextActive: { color: '#0B2D45' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', borderRadius: 12, padding: 13, marginBottom: 10 },
  cardRow1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  hosp: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  logoChip: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EAF2F8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoChipText: { fontSize: 12, fontWeight: '800', color: '#0F3D5C' },
  hname: { fontSize: 12.8, fontWeight: '700', color: '#14202E' },
  hloc: { fontSize: 11, color: '#5C6B7A', marginTop: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaPill: { fontSize: 10.8, color: '#5C6B7A', backgroundColor: '#F5F8FA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pay: { fontSize: 13.5, fontWeight: '800', color: '#0B2D45' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  outlineBtn: { flex: 1, borderWidth: 1.5, borderColor: '#175E86', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  outlineBtnText: { fontSize: 11.5, fontWeight: '700', color: '#175E86' },
  dangerBtn: { flex: 1, borderWidth: 0, backgroundColor: '#FBE7E4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  dangerBtnText: { fontSize: 11.5, fontWeight: '700', color: '#C0392B' },
  paymentReceivedBtn: { marginTop: 8, backgroundColor: '#1F8A5F', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  paymentReceivedBtnText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  paymentAcknowledged: { marginTop: 8, backgroundColor: '#E3F5EC', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  paymentAcknowledgedText: { fontSize: 12, fontWeight: '700', color: '#1F8A5F' },
  empty: { alignItems: 'center', paddingTop: 48 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#14202E', marginBottom: 4 },
  emptySub: { fontSize: 12, color: '#5C6B7A', textAlign: 'center' },
});
