import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Screen from '../../components/ui/Screen';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/ProfileStackNavigator';
import { useAuth } from '../../store/auth';
import authService from '../../services/authService';
import userService, { SettingsOut } from '../../services/userService';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '../../services/pushNotificationService';

type Props = { navigation: NativeStackNavigationProp<ProfileStackParamList, 'Settings'> };

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function NavRow({ icon, title, sub, isLast, onPress }: { icon: string; title: string; sub?: string; isLast?: boolean; onPress?: () => void }) {
  const inner = (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{icon}</Text></View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {onPress && <Text style={styles.chevron}>›</Text>}
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  }
  return inner;
}

function ToggleRow({ label, on, isLast, onToggle }: { label: string; on: boolean; isLast: boolean; onToggle: () => void }) {
  return (
    <View style={[styles.toggleRow, isLast && styles.toggleRowLast]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.switchTrack, on ? styles.switchOn : styles.switchOff]}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <View style={[styles.switchThumb, on ? styles.thumbRight : styles.thumbLeft]} />
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [settings, setSettings] = useState<SettingsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutModal, setLogoutModal] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await userService.getSettings();
      setSettings(data);
    } catch {
      // Use defaults if settings fail to load
      setSettings({ pushNotifications: true, smsAlerts: true, emailAlerts: false, profileVisible: true, showEarnings: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const updateToggle = async (field: keyof SettingsOut) => {
    if (!settings) return;
    const updated = { ...settings, [field]: !settings[field] };
    setSettings(updated);
    try {
      await userService.updateSettings({ [field]: updated[field] });
      // When the push toggle changes, actually register or deregister the device
      if (field === 'pushNotifications') {
        if (updated.pushNotifications) {
          await registerForPushNotifications();
        } else {
          await unregisterPushNotifications();
        }
      }
    } catch {
      // Revert on failure
      setSettings(settings);
    }
  };

  const handleLogout = () => setLogoutModal(true);

  const doLogout = async () => {
    setLogoutModal(false);
    try { await authService.logout(); } catch {}
    await logout();
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

  return (
    <Screen style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.appbarTitle}>Settings</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <SectionTitle label="Account" />
        <View style={styles.rowList}>
          <NavRow icon="🔒" title="Change Password" onPress={() => navigation.navigate('ChangePassword')} />
          <NavRow icon="📱" title="Phone Number"    onPress={() => navigation.navigate('EditProfile')} isLast />
        </View>

        <SectionTitle label="Notifications" />
        {settings && (
          <>
            <ToggleRow label="Push Notifications" on={settings.pushNotifications} isLast={false} onToggle={() => updateToggle('pushNotifications')} />
            <ToggleRow label="SMS Alerts"         on={settings.smsAlerts}         isLast={false} onToggle={() => updateToggle('smsAlerts')} />
            <ToggleRow label="Email Alerts"       on={settings.emailAlerts}       isLast        onToggle={() => updateToggle('emailAlerts')} />
          </>
        )}

        <SectionTitle label="Privacy" />
        <View style={styles.rowList}>
          {settings && (
            <ToggleRow label="Profile Visible to Facilities" on={settings.profileVisible} isLast={false} onToggle={() => updateToggle('profileVisible')} />
          )}
          <NavRow icon="🛡" title="Data & Security" onPress={() => navigation.navigate('DataSecurity')} isLast />
        </View>

        <SectionTitle label="Help & Support" />
        <View style={styles.rowList}>
          <NavRow icon="❓" title="FAQ"             onPress={() => navigation.navigate('HelpSupport')} />
          <NavRow icon="💬" title="Contact Support" onPress={() => navigation.navigate('HelpSupport')} />
          <NavRow
            icon="🐞"
            title="Report a Bug"
            onPress={() => Linking.openURL('mailto:covershiftswap@gmail.com?subject=Bug%20Report&body=Describe%20the%20issue%20here…')}
            isLast
          />
        </View>

        <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.85} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmModal
        visible={logoutModal}
        title="Log out?"
        description="Are you sure you want to log out of your account?"
        confirmLabel="Yes, Log out"
        dismissLabel="Cancel"
        confirmVariant="danger"
        onConfirm={doLogout}
        onDismiss={() => setLogoutModal(false)}
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
  body: { paddingHorizontal: 18, paddingBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#14202E', marginTop: 18, marginBottom: 10 },
  rowList: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#DCE4EA' },
  rowLast: { borderBottomWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF2F8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 16 },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 12.5, fontWeight: '700', color: '#14202E' },
  rowSub: { fontSize: 11, color: '#5C6B7A', marginTop: 1 },
  chevron: { fontSize: 20, color: '#A9B8C4', marginLeft: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#DCE4EA' },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleLabel: { fontSize: 12.5, fontWeight: '600', color: '#14202E' },
  switchTrack: { width: 38, height: 22, borderRadius: 20, justifyContent: 'center', flexShrink: 0 },
  switchOn: { backgroundColor: '#0F3D5C' },
  switchOff: { backgroundColor: '#DCE4EA' },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', position: 'absolute' },
  thumbRight: { right: 2 },
  thumbLeft: { left: 2 },
  logoutBtn: { backgroundColor: '#FBE7E4', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', marginTop: 20 },
  logoutBtnText: { fontSize: 13, fontWeight: '700', color: '#C0392B' },
});
