import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Screen from '../../components/ui/Screen';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import BackButton from '../../components/ui/BackButton';
import PickerField from '../../components/ui/PickerField';
import Toast, { ToastType } from '../../components/ui/Toast';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import authService from '../../services/authService';
import { useAuth } from '../../store/auth';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'GoogleSignup'>;
  route: RouteProp<AuthStackParamList, 'GoogleSignup'>;
};

const ROLES = [
  { label: 'Doctor', value: 'doctor' },
  { label: 'Nurse', value: 'nurse' },
  { label: 'OT Technician', value: 'ot_tech' },
  { label: 'Housekeeping', value: 'housekeeping' },
  { label: 'Facility Admin', value: 'facility_admin' },
];

const DOCTOR_SPECIALTIES = [
  'General Physician', 'Surgeon', 'Anaesthesiologist', 'Emergency Medicine',
  'Paediatrician', 'Gynaecologist', 'Orthopaedic', 'Cardiologist', 'Other',
];

const NURSE_SPECIALTIES = [
  'General Nursing', 'ICU / Critical Care', 'Emergency / Casualty',
  'Operation Theatre', 'Paediatric', 'Maternity / Labour Room', 'Other',
];

const FACILITY_TYPES = [
  'hospital', 'clinic', 'nursing_home', 'diagnostic_centre', 'other',
];

export default function GoogleSignupScreen({ navigation, route }: Props) {
  const { googleEmail, googleName, idToken } = route.params;
  const { saveTokens } = useAuth();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as ToastType });

  // Doctor
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [experience, setExperience] = useState('');

  // Nurse
  const [regNumber, setRegNumber] = useState('');

  // OT Tech
  const [certNumber, setCertNumber] = useState('');
  const [certifyingBody, setCertifyingBody] = useState('');

  // Housekeeping
  const [idProof, setIdProof] = useState('');
  const [workArea, setWorkArea] = useState('');

  // Facility Admin
  const [facilityName, setFacilityName] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [city, setCity] = useState('');

  const showToast = (message: string, type: ToastType = 'error') =>
    setToast({ visible: true, message, type });

  const handleSubmit = async () => {
    if (!role) { showToast('Please select your role'); return; }
    if (!phone) { showToast('Phone number is required'); return; }

    const form: any = { idToken, role, phone };

    if (role === 'doctor') {
      if (!licenseNumber || !specialty) { showToast('License number and specialty are required'); return; }
      form.licenseNumber = licenseNumber;
      form.specialty = specialty;
      form.experience = experience;
    } else if (role === 'nurse') {
      if (!regNumber || !specialty) { showToast('Registration number and specialty are required'); return; }
      form.regNumber = regNumber;
      form.specialty = specialty;
      form.experience = experience;
    } else if (role === 'ot_tech') {
      if (!certNumber || !certifyingBody) { showToast('Certification number and certifying body are required'); return; }
      form.certNumber = certNumber;
      form.certifyingBody = certifyingBody;
      form.experience = experience;
    } else if (role === 'housekeeping') {
      if (!idProof || !workArea) { showToast('ID proof and work area are required'); return; }
      form.idProof = idProof;
      form.workArea = workArea;
    } else if (role === 'facility_admin') {
      if (!facilityName || !facilityType || !city) { showToast('Facility name, type and city are required'); return; }
      form.facilityName = facilityName;
      form.facilityType = facilityType;
      form.city = city;
    }

    setLoading(true);
    try {
      const data = await authService.googleSignup(form);
      await saveTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: data.userId,
        role: data.role,
        isVerified: data.isVerified,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      showToast(typeof detail === 'string' ? detail : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen style={styles.container}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.heading}>Complete your profile</Text>
        <Text style={styles.subtitle}>Signed in as <Text style={styles.email}>{googleEmail}</Text></Text>

        <View style={styles.googleInfo}>
          <Text style={styles.googleName}>{googleName}</Text>
          <Text style={styles.googleEmail}>{googleEmail}</Text>
        </View>

        <PickerField
          label="I am a"
          value={role}
          onSelect={setRole}
          options={ROLES}
          placeholder="Select your role"
        />

        <Input label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 98765 43210" />

        {role === 'doctor' && <>
          <Input label="Medical License Number" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="MCI/NMC number" />
          <PickerField label="Specialty" value={specialty} onSelect={setSpecialty} options={DOCTOR_SPECIALTIES.map(s => ({ label: s, value: s }))} placeholder="Select specialty" />
          <Input label="Years of Experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" placeholder="e.g. 5" />
        </>}

        {role === 'nurse' && <>
          <Input label="Nursing Council Reg. Number" value={regNumber} onChangeText={setRegNumber} placeholder="INC/State council number" />
          <PickerField label="Specialty" value={specialty} onSelect={setSpecialty} options={NURSE_SPECIALTIES.map(s => ({ label: s, value: s }))} placeholder="Select specialty" />
          <Input label="Years of Experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" placeholder="e.g. 3" />
        </>}

        {role === 'ot_tech' && <>
          <Input label="Certification Number" value={certNumber} onChangeText={setCertNumber} placeholder="Your cert number" />
          <Input label="Certifying Body" value={certifyingBody} onChangeText={setCertifyingBody} placeholder="e.g. AHPI" />
          <Input label="Years of Experience" value={experience} onChangeText={setExperience} keyboardType="number-pad" placeholder="e.g. 2" />
        </>}

        {role === 'housekeeping' && <>
          <Input label="ID Proof Number" value={idProof} onChangeText={setIdProof} placeholder="Aadhaar / Voter ID / PAN" />
          <Input label="Preferred Work Area" value={workArea} onChangeText={setWorkArea} placeholder="e.g. Wards, OT, ICU" />
        </>}

        {role === 'facility_admin' && <>
          <Input label="Facility Name" value={facilityName} onChangeText={setFacilityName} placeholder="e.g. City General Hospital" />
          <PickerField label="Facility Type" value={facilityType} onSelect={setFacilityType} options={FACILITY_TYPES.map(t => ({ label: t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), value: t }))} placeholder="Select type" />
          <Input label="City" value={city} onChangeText={setCity} placeholder="e.g. Mumbai" />
        </>}

        <Button title="Create Account" onPress={handleSubmit} loading={loading} style={styles.btn} />
      </ScrollView>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(t => ({ ...t, visible: false }))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 40 },
  heading: { fontSize: 20, fontWeight: '800', color: '#14202E', marginTop: 16, marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#5C6B7A', marginBottom: 16 },
  email: { color: '#0F3D5C', fontWeight: '700' },
  googleInfo: {
    backgroundColor: '#F0F7FF', borderRadius: 10, padding: 12, marginBottom: 20,
    borderWidth: 1, borderColor: '#C8DFF5',
  },
  googleName: { fontSize: 14, fontWeight: '700', color: '#14202E' },
  googleEmail: { fontSize: 12, color: '#5C6B7A', marginTop: 2 },
  btn: { marginTop: 24 },
});
