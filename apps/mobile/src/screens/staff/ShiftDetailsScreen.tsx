import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Screen from '../../components/ui/Screen';
import Toast from '../../components/ui/Toast';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ShiftsStackParamList } from '../../navigation/ShiftsStackNavigator';
import shiftService from '../../services/shiftService';
import { ShiftDetail } from '../../services/shiftService';
import { shiftDateRange } from '../../utils/shiftDates';

type Props = {
  navigation: NativeStackNavigationProp<ShiftsStackParamList, 'ShiftDetails'>;
  route: RouteProp<ShiftsStackParamList, 'ShiftDetails'>;
};

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  ot_tech: 'OT Technician',
  housekeeping: 'Housekeeping',
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function ShiftDetailsScreen({ navigation, route }: Props) {
  const { shiftId } = route.params;
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });

  useFocusEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      parent?.setOptions({
        tabBarStyle: {
          backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#DCE4EA',
          height: 62, paddingBottom: 6, paddingTop: 6,
        },
      });
    };
  });

  const loadShift = useCallback(async () => {
    try {
      const data = await shiftService.getShift(shiftId);
      setShift(data);
      setFavorite(data.isFavorite);
    } catch {
      setToast({ visible: true, message: 'Failed to load shift details.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  useEffect(() => { loadShift(); }, [loadShift]);

  const handleApply = async () => {
    if (!shift) return;
    setApplying(true);
    try {
      await shiftService.applyToShift(shiftId);
      setToast({ visible: true, message: 'Application submitted!', type: 'success' });
      loadShift();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Could not apply. Please try again.';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setApplying(false);
    }
  };

  const toggleFavorite = async () => {
    if (!shift) return;
    try {
      if (favorite) {
        await shiftService.removeFavorite(shiftId);
      } else {
        await shiftService.addFavorite(shiftId);
      }
      setFavorite(!favorite);
    } catch {
      setToast({ visible: true, message: 'Could not update favorites.', type: 'error' });
    }
  };

  if (loading) {
    return (
      <Screen style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#0F3D5C" />
        </View>
      </Screen>
    );
  }

  if (!shift) {
    return (
      <Screen style={styles.container}>
        <View style={styles.appbar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ textAlign: 'center', marginTop: 40, color: '#5C6B7A' }}>Shift not found</Text>
      </Screen>
    );
  }

  const isApplied = shift.applicationStatus != null;
  const isConfirmed = shift.applicationStatus === 'confirmed';
  const isCancelled = shift.status === 'cancelled';
  const hasStarted = shift.hasStarted;
  const roleLabel = ROLE_LABELS[shift.role] ?? shift.role;

  return (
    <Screen style={styles.container}>
      {/* Appbar */}
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.iconBtn} onPress={toggleFavorite} activeOpacity={0.8}>
          <Text style={styles.iconBtnText}>{favorite ? '♥' : '♡'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Hero Banner */}
        <LinearGradient
          colors={['#0F3D5C', '#1B6C97']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          {shift.isUrgent && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentBadgeText}>Urgent</Text>
            </View>
          )}
          {shift.isNight && !shift.isUrgent && (
            <View style={[styles.urgentBadge, { backgroundColor: '#EEF0FE' }]}>
              <Text style={[styles.urgentBadgeText, { color: '#3B5BDB' }]}>Night</Text>
            </View>
          )}
          {shift.isWeekend && !shift.isUrgent && !shift.isNight && (
            <View style={[styles.urgentBadge, { backgroundColor: '#F0FEF4' }]}>
              <Text style={[styles.urgentBadgeText, { color: '#1F8A5F' }]}>Weekend</Text>
            </View>
          )}
        </LinearGradient>

        {/* Hospital Row */}
        <View style={styles.hospRow}>
          <View style={styles.logoChip}>
            <Text style={styles.logoChipText}>
              {shift.facility?.initials || (shift.facility?.name ?? '??').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={styles.hospInfo}>
            <Text style={styles.hospName}>{shift.facility?.name}</Text>
            <Text style={styles.hospMeta}>
              📍 {shift.facility?.location}
              {shift.facility?.rating ? `  ·  ${shift.facility.rating.toFixed(1)}★ facility rating` : ''}
            </Text>
          </View>
        </View>

        {/* Detail Card */}
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>📅 Date & Time</Text>
            <Text style={styles.detailValue}>{shiftDateRange(shift.startTime, shift.endTime, formatDate)}, {formatTime(shift.startTime, shift.endTime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>📍 Location</Text>
            <Text style={styles.detailValue}>{shift.facility?.location ?? '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>🩺 Role Needed</Text>
            <Text style={styles.detailValue}>{roleLabel} · {shift.specialty}</Text>
          </View>
          <View style={[styles.detailRow, styles.detailRowLast]}>
            <Text style={styles.detailLabel}>⏱ Duration</Text>
            <Text style={styles.detailValue}>{shift.durationHours} hours</Text>
          </View>
        </View>

        {/* Requirements */}
        {!!(shift.requirements) && (
          <>
            <Text style={styles.sectionTitle}>Requirements</Text>
            <Text style={styles.requirementsText}>{shift.requirements}</Text>
          </>
        )}

        {/* Facilities Available */}
        {shift.amenities && shift.amenities.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Facilities Available</Text>
            <View style={styles.amenitiesRow}>
              {shift.amenities.map((a) => (
                <View key={a} style={styles.amenityTag}>
                  <Text style={styles.amenityTagText}>{a}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerPayLabel}>Pay rate</Text>
          <Text style={styles.footerPay}>₹{shift.payRate.toLocaleString('en-IN')}</Text>
        </View>
        {isCancelled ? (
          <View style={[styles.applyBtn, { backgroundColor: '#8697A6' }]}>
            <Text style={styles.applyBtnText}>Shift Cancelled</Text>
          </View>
        ) : isConfirmed ? (
          <View style={[styles.applyBtn, { backgroundColor: '#1F8A5F' }]}>
            <Text style={styles.applyBtnText}>Confirmed ✓</Text>
          </View>
        ) : isApplied ? (
          <View style={[styles.applyBtn, { backgroundColor: '#8697A6' }]}>
            <Text style={styles.applyBtnText}>Applied ✓</Text>
          </View>
        ) : hasStarted ? (
          <View style={[styles.applyBtn, { backgroundColor: '#8697A6' }]}>
            <Text style={styles.applyBtnText}>Already started</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.85} disabled={applying}>
            <Text style={styles.applyBtnText}>{applying ? 'Applying…' : 'Apply for Shift'}</Text>
          </TouchableOpacity>
        )}
      </View>

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
  appbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  backBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#0F3D5C', lineHeight: 22 },
  spacer: { flex: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 16, color: '#C0392B' },

  body: { paddingHorizontal: 18, paddingBottom: 20 },

  heroBanner: { height: 110, borderRadius: 12, marginBottom: 14, justifyContent: 'flex-end', padding: 12 },
  urgentBadge: { alignSelf: 'flex-start', backgroundColor: '#FBE7E4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  urgentBadgeText: { fontSize: 11, fontWeight: '700', color: '#C0392B' },

  hospRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  logoChip: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#EAF2F8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoChipText: { fontSize: 13, fontWeight: '800', color: '#0F3D5C' },
  hospInfo: { flex: 1 },
  hospName: { fontSize: 15, fontWeight: '800', color: '#14202E' },
  hospMeta: { fontSize: 11.5, color: '#5C6B7A', marginTop: 2 },

  detailCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE4EA', borderRadius: 12, paddingHorizontal: 13, marginBottom: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4F7' },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 13, fontWeight: '700', color: '#14202E' },
  detailValue: { fontSize: 12.5, color: '#5C6B7A', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#14202E', marginBottom: 8 },
  requirementsText: { fontSize: 13, color: '#5C6B7A', lineHeight: 20, marginBottom: 18 },

  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  amenityTag: { backgroundColor: '#EAF2F8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  amenityTagText: { fontSize: 12.5, fontWeight: '600', color: '#175E86' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#DCE4EA', backgroundColor: '#F5F8FA' },
  footerPayLabel: { fontSize: 10.5, color: '#5C6B7A' },
  footerPay: { fontSize: 18, fontWeight: '800', color: '#0B2D45' },
  applyBtn: { backgroundColor: '#0F3D5C', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 13 },
  applyBtnText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
});
