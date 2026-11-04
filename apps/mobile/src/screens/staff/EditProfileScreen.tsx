import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import userService from '../../services/userService';
import { getFileUrl } from '../../services/api';
import Screen from '../../components/ui/Screen';
import Toast from '../../components/ui/Toast';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ProfileStackParamList } from '../../navigation/ProfileStackNavigator';
import PickerField from '../../components/ui/PickerField';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'EditProfile'>;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const EXPERIENCE = ['0–2 years', '3–5 years', '6–10 years', '10+ years'];

// Matches the options shown on each role's signup screen
const ROLE_SPECIALTY_CONFIG: Record<string, { label: string; options: string[] }> = {
  doctor: {
    label: 'Specialty',
    options: ['General Medicine', 'Emergency Medicine', 'Anaesthesia', 'Pediatrics'],
  },
  nurse: {
    label: 'Nursing Specialty',
    options: ['ICU Nursing', 'General Ward', 'OT Nursing', 'Pediatric Nursing', 'Emergency Nursing'],
  },
  ot_tech: {
    label: 'Certifying Body',
    options: ['Diploma in OT Technology', 'B.Sc. OT Technology', 'Allied Health Council'],
  },
  housekeeping: {
    label: 'Preferred Work Area',
    options: ['General Ward', 'OT Housekeeping', 'Admin Block', 'ICU'],
  },
};

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function InputField({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor="#A9B8C4"
        autoCapitalize="none"
      />
    </View>
  );
}

function DateField({ label, value, onChange }: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [show, setShow] = useState(false);
  const pickerValue = value ?? new Date(1990, 0, 1);

  const onPickerChange = (_e: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (selected) onChange(selected);
  };

  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <TouchableOpacity style={styles.dateInput} onPress={() => setShow(true)} activeOpacity={0.8}>
        <Text style={[styles.dateText, !value && { color: '#A9B8C4' }]}>
          {value ? formatDate(value) : 'Select date of birth'}
        </Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={onPickerChange}
        />
      )}
      {show && Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.doneBtn} onPress={() => setShow(false)}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}


// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditProfileScreen({ navigation }: Props) {
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [dob,        setDob]        = useState<Date | null>(null);
  const [initials,   setInitials]   = useState('?');
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [role,       setRole]       = useState('doctor');
  const [specialty,  setSpecialty]  = useState('');
  const [experience,         setExperience]         = useState(EXPERIENCE[0]);
  const [preferredLocations, setPreferredLocations] = useState('');
  const [minPayRate,         setMinPayRate]         = useState('');
  const [loading,            setLoading]            = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });

  useEffect(() => {
    (async () => {
      try {
        const data = await userService.getMe();
        setName(data.user.fullName);
        setEmail(data.user.email ?? '');
        setPhone(data.user.phone ?? '');
        setInitials(data.user.fullName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase());
        setAvatarUrl(getFileUrl(data.user.avatarUrl));
        const userRole = data.user.role;
        setRole(userRole);
        const config = ROLE_SPECIALTY_CONFIG[userRole] ?? ROLE_SPECIALTY_CONFIG.doctor;
        setSpecialty(data.profile?.specialty ?? config.options[0]);
        if (data.dateOfBirth) setDob(new Date(data.dateOfBirth));
        if (data.profile?.experience) setExperience(data.profile.experience);
        setPreferredLocations((data.profile?.preferredLocations ?? []).join(', '));
        setMinPayRate(data.profile?.minPayRate != null ? String(data.profile.minPayRate) : '');
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const fileName = asset.uri.split('/').pop() ?? 'avatar.jpg';
    const mimeType = asset.mimeType || 'image/jpeg';

    setUploadingPhoto(true);
    try {
      const updated = await userService.uploadAvatar({ uri: asset.uri, name: fileName, type: mimeType });
      setAvatarUrl(getFileUrl(updated.user.avatarUrl));
      setToast({ visible: true, message: 'Photo updated successfully', type: 'success' });
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.detail ?? 'Failed to upload photo. Please try again.';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await userService.updateMe({
        fullName: name,
        phone,
        // Local date: toISOString() gives the UTC date, a day early in IST.
        dateOfBirth: dob
          ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`
          : undefined,
        specialty,
        experience,
        preferredLocations: preferredLocations.split(',').map(s => s.trim()).filter(Boolean),
        minPayRate: minPayRate ? parseFloat(minPayRate) : undefined,
      });
      navigation.goBack();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save profile.';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally { setSaving(false); }
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
      {/* App Bar */}
      <View style={styles.appbar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.appbarTitle}>Edit Profile</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Avatar + Change Photo */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => avatarUrl && setPreviewVisible(true)}
            disabled={!avatarUrl}
          >
            <View style={styles.avatarLg}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarLgText}>{initials}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={handleChangePhoto} disabled={uploadingPhoto}>
            <Text style={styles.changePhotoText}>
              {uploadingPhoto ? 'Uploading…' : 'Change Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Fullscreen image preview */}
        {avatarUrl && (
          <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
            <StatusBar backgroundColor="#000" barStyle="light-content" />
            <View style={styles.previewOverlay}>
              <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)} activeOpacity={0.8}>
                <Text style={styles.previewCloseText}>✕</Text>
              </TouchableOpacity>
              <Image source={{ uri: avatarUrl }} style={styles.previewImage} resizeMode="contain" />
            </View>
          </Modal>
        )}

        {/* Fields */}
        <InputField label="Full Name"    value={name}  onChangeText={setName} />
        {/* Email is read-only — shown for reference */}
        <View style={styles.field}>
          <FieldLabel label="Email Address" />
          <View style={[styles.input, { justifyContent: 'center', backgroundColor: '#F5F8FA' }]}>
            <Text style={{ fontSize: 13, color: '#8697A6' }}>{email}</Text>
          </View>
        </View>
        <InputField label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <DateField  label="Date of Birth" value={dob}  onChange={setDob} />
        <PickerField
          label={(ROLE_SPECIALTY_CONFIG[role] ?? ROLE_SPECIALTY_CONFIG.doctor).label}
          options={(ROLE_SPECIALTY_CONFIG[role] ?? ROLE_SPECIALTY_CONFIG.doctor).options}
          value={specialty}
          onSelect={setSpecialty}
        />
        <PickerField label="Years of Experience" options={EXPERIENCE} value={experience} onSelect={setExperience} />
        <InputField
          label="Preferred Locations"
          value={preferredLocations}
          onChangeText={setPreferredLocations}
          placeholder="e.g. Pune, Mumbai"
        />
        <InputField
          label="Minimum Pay Rate (₹ / shift)"
          value={minPayRate}
          onChangeText={setMinPayRate}
          keyboardType="numeric"
          placeholder="e.g. 1500"
        />

        {/* Cancel / Save buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={styles.outlineBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FA' },

  // App bar
  appbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DCE4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: '#0F3D5C', lineHeight: 22 },
  appbarTitle: { fontSize: 16.5, fontWeight: '800', color: '#14202E' },
  spacer: { flex: 1 },

  body: { paddingHorizontal: 18, paddingBottom: 28 },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLg: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#EAF2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarLgText: { fontSize: 20, fontWeight: '800', color: '#0F3D5C' },
  avatarImage: { width: 64, height: 64, borderRadius: 16 },

  // Fullscreen preview
  previewOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  previewImage: { width: '100%', height: '100%' },
  previewClose: {
    position: 'absolute', top: 48, right: 20, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#000',
    borderWidth: 1.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  previewCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  changePhotoText: { fontSize: 11.5, fontWeight: '700', color: '#175E86' },

  // Field
  field: { marginBottom: 13 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#5C6B7A', marginBottom: 6 },

  // Text input
  input: {
    borderWidth: 1.4,
    borderColor: '#DCE4EA',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: '#14202E',
    backgroundColor: '#fff',
  },

  // Date input
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.4,
    borderColor: '#DCE4EA',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  dateText: { fontSize: 13, color: '#14202E' },
  dateIcon: { fontSize: 14 },
  doneBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#0F3D5C',
    borderRadius: 8,
  },
  doneBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Button row
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#0F3D5C',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700', color: '#0F3D5C' },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0F3D5C',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
