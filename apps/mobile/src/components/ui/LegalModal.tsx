import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';

// ─── Content ─────────────────────────────────────────────────────────────────

const TERMS_SECTIONS = [
  {
    heading: '1. Acceptance of Terms',
    body: 'By creating an account on Covershift, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.',
  },
  {
    heading: '2. Eligibility',
    body: 'You must be at least 18 years of age and hold valid professional credentials (where applicable) to register on Covershift. By registering, you confirm that all information provided is accurate and up to date.',
  },
  {
    heading: '3. Account Responsibilities',
    body: 'You are responsible for maintaining the confidentiality of your login credentials. You agree to notify us immediately of any unauthorised access to your account. Covershift is not liable for any loss resulting from unauthorised use of your account.',
  },
  {
    heading: '4. Professional Conduct',
    body: 'Healthcare professionals using Covershift agree to uphold the standards of their respective licensing bodies, arrive punctually for confirmed shifts, and provide truthful information about qualifications and experience.',
  },
  {
    heading: '5. Shift Bookings & Cancellations',
    body: 'Accepting a shift constitutes a commitment to fulfil that shift. Cancellations must be made at least 24 hours in advance. Repeated last-minute cancellations may result in account suspension.',
  },
  {
    heading: '6. Payments & Earnings',
    body: 'Payments are processed according to the agreed shift rate. Covershift may deduct applicable service fees before disbursement. All payment disputes must be raised within 7 days of the shift completion date.',
  },
  {
    heading: '7. Termination',
    body: 'Covershift reserves the right to suspend or terminate accounts that violate these terms, submit fraudulent documents, or engage in conduct that harms the platform or its users.',
  },
  {
    heading: '8. Amendments',
    body: 'We may update these Terms of Service from time to time. Continued use of the platform after changes are posted constitutes acceptance of the revised terms.',
  },
];

const PRIVACY_SECTIONS = [
  {
    heading: '1. Information We Collect',
    body: 'We collect information you provide at registration (name, email, phone, professional credentials), usage data (shifts applied, sessions), and device information (OS version, push token for notifications).',
  },
  {
    heading: '2. How We Use Your Information',
    body: 'Your information is used to match you with suitable shift opportunities, process payments, send relevant notifications, verify professional credentials, and improve the Covershift platform.',
  },
  {
    heading: '3. Data Sharing',
    body: 'We share your profile and credentials with healthcare facilities you apply to work at. We do not sell your personal data to third parties. We may share data with payment processors and identity verification partners solely to deliver our services.',
  },
  {
    heading: '4. Document Storage',
    body: 'Professional documents (licenses, certifications, ID proofs) are stored securely and encrypted at rest. They are accessible only to authorised facility administrators and Covershift compliance staff.',
  },
  {
    heading: '5. Data Retention',
    body: 'Your data is retained for as long as your account is active or as required by law. You may request deletion of your account and associated data at any time via Settings → Help & Support.',
  },
  {
    heading: '6. Cookies & Analytics',
    body: 'We use anonymised analytics to understand app usage patterns and improve performance. No personally identifiable information is used in analytics reporting.',
  },
  {
    heading: '7. Your Rights',
    body: 'You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at covershiftswap@gmail.com. We will respond within 30 days.',
  },
  {
    heading: '8. Security',
    body: 'We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, and regular security audits. However, no method of transmission over the internet is 100% secure.',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type LegalType = 'terms' | 'privacy';

interface LegalModalProps {
  visible: boolean;
  type: LegalType;
  onClose: () => void;
  onAccept: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
const SHEET_H = SCREEN_H * 0.82;

export default function LegalModal({ visible, type, onClose, onAccept }: LegalModalProps) {
  const translateY = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 180,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_H,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const isTerms = type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const lastUpdated = 'Last updated: 1 September 2026';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.lastUpdated}>{lastUpdated}</Text>

        {/* Content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((sec) => (
            <View key={sec.heading} style={styles.section}>
              <Text style={styles.sectionHeading}>{sec.heading}</Text>
              <Text style={styles.sectionBody}>{sec.body}</Text>
            </View>
          ))}
          <View style={styles.scrollPad} />
        </ScrollView>

        {/* Accept button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.85}>
            <Text style={styles.acceptBtnText}>I Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.declineBtn} activeOpacity={0.7}>
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14, 29, 46, 0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_H,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DCE4EA',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#14202E',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F8FA',
    borderWidth: 1,
    borderColor: '#DCE4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 12,
    color: '#5C6B7A',
    lineHeight: 16,
  },
  lastUpdated: {
    fontSize: 10.5,
    color: '#8697A6',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F3D5C',
    marginBottom: 5,
  },
  sectionBody: {
    fontSize: 12.5,
    color: '#3D5060',
    lineHeight: 19,
  },
  scrollPad: { height: 12 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#DCE4EA',
    gap: 10,
  },
  acceptBtn: {
    backgroundColor: '#0F3D5C',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  declineBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  declineBtnText: {
    fontSize: 12,
    color: '#8697A6',
    fontWeight: '600',
  },
});
