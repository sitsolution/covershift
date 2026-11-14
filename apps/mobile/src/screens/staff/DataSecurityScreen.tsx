import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Screen from '../../components/ui/Screen';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/ProfileStackNavigator';
import { useAuth } from '../../store/auth';
import userService from '../../services/userService';
import authService from '../../services/authService';

type Props = { navigation: NativeStackNavigationProp<ProfileStackParamList, 'DataSecurity'> };

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoBody}>{body}</Text>
    </View>
  );
}

export default function DataSecurityScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as 'error' | 'success' });

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await userService.deleteAccount();
      try { await authService.logout(); } catch {}
      await logout();
    } catch (err: any) {
      setDeleteModal(false);
      setDeleting(false);
      setToast({ visible: true, message: err?.response?.data?.detail ?? 'Could not delete account. Please try again.', type: 'error' });
    }
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.appbarTitle}>Data & Security</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <SectionTitle label="Your Data" />
        <InfoBlock
          title="What we collect"
          body="We collect your name, contact details, professional credentials, and shift history to match you with healthcare facilities and process payments."
        />
        <InfoBlock
          title="How we use it"
          body="Your data is used solely to operate the Covershift platform. We do not sell your personal information to third parties."
        />
        <InfoBlock
          title="Data retention"
          body="When you delete your account, your profile, documents, photo and contact details are deleted. Records of past shifts and payments are kept without your name, for facility and tax records."
        />

        <SectionTitle label="Security" />
        <InfoBlock
          title="Password"
          body="Your password is stored as a secure hash. We can never see your password. Use a unique password you don't use elsewhere."
        />
        <InfoBlock
          title="Sessions"
          body="You are logged in using a secure access token. Logging out invalidates your session immediately on all devices."
        />

        <SectionTitle label="Account" />
        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>Delete Account</Text>
          <Text style={styles.dangerBody}>
            Permanently deletes your account, profile, documents and photo. You will no longer be able to log in. This action cannot be undone.
          </Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            activeOpacity={0.85}
            onPress={() => setDeleteModal(true)}
          >
            <Text style={styles.deleteBtnText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={deleteModal}
        title="Delete account?"
        description="This will permanently delete your account and your personal data. You will be logged out immediately and cannot undo this."
        confirmLabel={deleting ? 'Deleting…' : 'Yes, Delete'}
        dismissLabel="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteAccount}
        onDismiss={() => { if (!deleting) setDeleteModal(false); }}
      />

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
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
  infoBlock: { backgroundColor: '#fff', borderRadius: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: '#DCE4EA' },
  infoTitle: { fontSize: 12.5, fontWeight: '700', color: '#14202E', marginBottom: 4 },
  infoBody: { fontSize: 12, color: '#5C6B7A', lineHeight: 17 },
  dangerCard: { backgroundColor: '#FEF0EE', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#F5C5BE', marginTop: 4 },
  dangerTitle: { fontSize: 13, fontWeight: '800', color: '#C0392B', marginBottom: 6 },
  dangerBody: { fontSize: 12, color: '#7B241C', lineHeight: 17, marginBottom: 12 },
  deleteBtn: { backgroundColor: '#C0392B', borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
