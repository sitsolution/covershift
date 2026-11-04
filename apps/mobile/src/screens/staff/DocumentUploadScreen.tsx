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
} from 'react-native';
import Screen from '../../components/ui/Screen';
import Toast from '../../components/ui/Toast';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { DocsStackParamList } from '../../navigation/DocsStackNavigator';
import PickerField from '../../components/ui/PickerField';
import documentService, { DocumentTypeOption } from '../../services/documentService';

type Props = {
  navigation: NativeStackNavigationProp<DocsStackParamList, 'DocumentUpload'>;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Local YYYY-MM-DD. toISOString() would give the UTC date — the picker
 *  returns local midnight, which is the previous day in UTC for IST. */
function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── Date Field ───────────────────────────────────────────────────────────────

function DateField({ label, value, onChange, minimumDate, maximumDate }: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const [show, setShow] = useState(false);

  const onPickerChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (selected) onChange(selected);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dateInput} onPress={() => setShow(true)} activeOpacity={0.8}>
        <Text style={styles.dateText}>{formatDate(value)}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPickerChange}
          onTouchCancel={() => setShow(false)}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
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

type PickedFile = { uri: string; name: string; type: string };

export default function DocumentUploadScreen({ navigation }: Props) {
  const [docTypes, setDocTypes] = useState<DocumentTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [selectedType, setSelectedType] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date(2022, 2, 4));
  const [expiryDate, setExpiryDate] = useState(new Date(2027, 2, 4));
  const [checked, setChecked] = useState(false);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' });

  const loadTypes = useCallback(async () => {
    try {
      const types = await documentService.getDocumentTypes();
      setDocTypes(types);
      if (types.length > 0) setSelectedType(types[0].value);
    } catch {
      setToast({ visible: true, message: 'Could not load document types. Pull down to retry.', type: 'error' });
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const currentType = docTypes.find(t => t.value === selectedType);

  const handleBrowseFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setPickedFile({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? 'application/octet-stream',
        });
      }
    } catch {
      setToast({ visible: true, message: 'Could not open file picker.', type: 'error' });
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setToast({ visible: true, message: 'Camera access is needed to take a photo.', type: 'info' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const name = asset.uri.split('/').pop() ?? 'photo.jpg';
      setPickedFile({ uri: asset.uri, name, type: 'image/jpeg' });
    }
  };

  const handleUpload = async () => {
    if (!pickedFile) {
      setToast({ visible: true, message: 'Please select or take a photo of your document.', type: 'info' });
      return;
    }
    if (!checked) {
      setToast({ visible: true, message: 'Please confirm the document is valid and belongs to you.', type: 'info' });
      return;
    }

    setUploading(true);
    try {
      await documentService.uploadDocument({
        file: pickedFile,
        docType: selectedType,
        documentNumber: docNumber || undefined,
        issueDate: toISODate(issueDate),
        expiryDate: currentType?.requiresExpiry ? toISODate(expiryDate) : undefined,
      });
      setToast({ visible: true, message: 'Document submitted for verification.', type: 'success' });
      navigation.goBack();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Upload failed.';
      setToast({ visible: true, message: msg, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  if (loadingTypes) {
    return (
      <Screen style={styles.container}>
        <View style={styles.appbar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.appbarTitle}>Upload Document</Text>
          <View style={styles.spacer} />
        </View>
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
        <Text style={styles.appbarTitle}>Upload Document</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

        {/* Document Type selector */}
        <PickerField
          label="Document Type"
          options={docTypes.map(t => t.label)}
          value={currentType?.label ?? ''}
          onSelect={(label) => {
            const found = docTypes.find(t => t.label === label);
            if (found) setSelectedType(found.value);
          }}
        />

        {/* Upload area */}
        <TouchableOpacity style={styles.uploadArea} onPress={handleBrowseFile} activeOpacity={0.8}>
          <Text style={styles.uploadIcon}>📄</Text>
          <Text style={styles.uploadTitle}>
            {pickedFile ? pickedFile.name : 'Tap to browse file'}
          </Text>
          <Text style={styles.uploadSub}>PDF, JPG, PNG up to 10MB</Text>
        </TouchableOpacity>

        {/* Take Photo button */}
        <TouchableOpacity style={styles.outlineBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
          <Text style={styles.outlineBtnText}>📷  Take Photo</Text>
        </TouchableOpacity>

        {/* Document Number */}
        {(currentType?.requiresNumber ?? true) && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Document Number</Text>
            <TextInput
              style={styles.input}
              placeholder="MCI-2019-88213"
              placeholderTextColor="#A9B8C4"
              value={docNumber}
              onChangeText={setDocNumber}
            />
          </View>
        )}

        {/* Issue Date */}
        <DateField label="Issue Date" value={issueDate} onChange={setIssueDate} maximumDate={new Date()} />

        {/* Expiry Date */}
        {(currentType?.requiresExpiry ?? true) && (
          <DateField label="Expiry Date" value={expiryDate} onChange={setExpiryDate} minimumDate={new Date()} />
        )}

        {/* Confirmation checkbox */}
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setChecked(c => !c)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            I confirm this document is valid and belongs to me
          </Text>
        </TouchableOpacity>

        {/* Upload button */}
        <TouchableOpacity
          style={[styles.primaryBtn, uploading && styles.primaryBtnDisabled]}
          onPress={handleUpload}
          activeOpacity={0.85}
          disabled={uploading}
        >
          <Text style={styles.primaryBtnText}>{uploading ? 'Uploading…' : 'Upload'}</Text>
        </TouchableOpacity>
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

  field: { marginBottom: 13 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#5C6B7A', marginBottom: 6 },

  // Upload area
  uploadArea: {
    borderWidth: 1.6,
    borderColor: '#DCE4EA',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 26,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadIcon: { fontSize: 24, marginBottom: 8 },
  uploadTitle: { fontSize: 12, fontWeight: '700', color: '#14202E', marginBottom: 2, textAlign: 'center' },
  uploadSub: { fontSize: 10.5, color: '#5C6B7A' },

  // Outline button
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#0F3D5C',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 14,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700', color: '#0F3D5C' },

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

  // Checkbox row
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#DCE4EA',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: '#0F3D5C', borderColor: '#0F3D5C' },
  checkmark: { fontSize: 11, color: '#fff', fontWeight: '800' },
  checkLabel: { fontSize: 11.5, color: '#5C6B7A', flex: 1, lineHeight: 17 },

  // Primary button
  primaryBtn: {
    backgroundColor: '#0F3D5C',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
