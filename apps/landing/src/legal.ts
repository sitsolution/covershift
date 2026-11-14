// Public legal pages: Privacy Policy, Terms, Cookie Policy, Delete Account.
// Google Play links to /privacy-policy and /delete-account, so keep those
// paths stable. Paragraphs are "Heading\nBody" or plain text.

export const CONTACT_EMAIL = 'covershiftswap@gmail.com';

export type LegalPage = { path: string; title: string; body: string[] };

const UPDATED = 'Last updated: November 2026';

export const LEGAL_PAGES: LegalPage[] = [
  {
    path: '/privacy-policy',
    title: 'Privacy Policy',
    body: [
      UPDATED,
      'CoverShift ("we", "our", or "us") connects healthcare facilities with healthcare professionals for temporary shifts, through the CoverShift mobile app, the facility admin panel and this website. This Privacy Policy explains what information we collect, how we use and share it, and the choices you have.',
      'Information You Give Us\n• Account details: name, email address, phone number, date of birth, your role (for example doctor or nurse) and a password, which we store only in hashed form.\n• Professional details: registration, licence or ID number, specialty, experience, qualifications, preferred locations and pay preferences.\n• Payout details: bank name, IFSC code and the last 4 digits of your account number.\n• Documents and photos you upload: licences, certifications, ID proof and your profile photo. The camera is used only when you choose to photograph a document.\n• Messages you send to facilities and support requests you submit.',
      'Information Created When You Use CoverShift\n• Shifts you view, save, apply for and work, your availability, and related payments.\n• A push notification token for your device, so we can send you shift and application alerts.\nWe do not access your location, contacts, microphone or photo library.',
      'How We Use Your Information\nTo create and secure your account; to show you suitable shifts and send you alerts; to let facilities review your profile and credentials when you apply; to process shift bookings and payments; to send verification codes and service emails; and to respond to support requests.',
      'Who We Share It With\n• Facilities you apply to or work with see your profile, credentials and documents so they can verify and book you.\n• Service providers that run parts of our service for us: our servers in India (hosting and storage), Resend (email delivery), Google Firebase Cloud Messaging and Expo (push notifications) and Google Sign-In, if you choose to use it.\n• Authorities, where the law requires it.\nWe do not sell your personal information or use it for advertising.',
      'How We Protect It\nAll traffic is encrypted with HTTPS, passwords are hashed, and your documents can be opened only by you and authorised administrators.',
      'How Long We Keep It\nWe keep your information while your account is active. When you delete your account, your profile, documents, photo and contact details are deleted. Records of past shifts and payments are kept without your name, for facility and tax records.',
      'Deleting Your Account\nIn the app, go to Profile → Data & Security → Delete My Account. You can also request deletion from our Delete Account page at www.covershift.in/delete-account.',
      'Your Choices\nYou can view and correct your details in the app at any time, turn notifications on or off in Settings, and delete your account as described above.',
      'Children\nCoverShift is for professionals aged 18 or over. We do not knowingly collect information from anyone under 18.',
      'Changes to This Policy\nIf we change this policy we will update the date at the top of this page, and tell you in the app for significant changes.',
      `Contact Us\nIf you have any questions about this Privacy Policy or your data, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
  {
    path: '/delete-account',
    title: 'Delete Your CoverShift Account',
    body: [
      UPDATED,
      'You can delete your CoverShift account and personal data at any time.',
      'Delete From the App\n1. Open the CoverShift app and log in.\n2. Go to Profile → Data & Security.\n3. Tap "Delete My Account" and confirm.\nYour account is deleted immediately.',
      `Request Deletion by Email\nIf you can no longer use the app, email ${CONTACT_EMAIL} from the email address registered with your account, with the subject "Delete my account". We will delete your account within 30 days and confirm by email.`,
      'What Is Deleted\nYour profile, contact details (name, email, phone, date of birth), professional and payout details, uploaded documents, profile photo, notifications, availability, support requests and device registrations.',
      'What Is Kept\nRecords of shifts you applied for or worked and related payments are kept without your name, because facilities need them for their records and tax purposes. Pending applications are cancelled.',
    ],
  },
  {
    path: '/terms',
    title: 'Terms of Service',
    body: [
      'Last updated: January 2025',
      'By accessing or using Covershift, you agree to be bound by these Terms of Service. Please read them carefully.',
      'Use of the Platform\nCovershift provides a platform connecting healthcare facilities with medical professionals for temporary staffing purposes. You must be at least 18 years old and legally permitted to work in India to use our services.',
      'User Responsibilities\nYou are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to provide accurate and complete information when registering.',
      'Healthcare Professionals\nMedical professionals using Covershift must hold valid, current credentials and licences as required by law. You are solely responsible for maintaining and updating your professional qualifications.',
      'Healthcare Facilities\nFacilities using Covershift are responsible for verifying staff credentials independently and ensuring compliance with all applicable healthcare regulations.',
      'Limitation of Liability\nCovershift is a technology platform and is not responsible for the quality of medical services provided. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.',
      `Contact Us\nFor questions about these Terms, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
  {
    path: '/cookie-policy',
    title: 'Cookie Policy',
    body: [
      'Last updated: January 2025',
      'This Cookie Policy explains how Covershift uses cookies and similar tracking technologies when you visit our website.',
      'What Are Cookies\nCookies are small text files stored on your device when you visit a website. They help us provide you with a better experience by remembering your preferences and understanding how you use our platform.',
      'How We Use Cookies\nWe use essential cookies required for the platform to function; analytics cookies to understand how visitors interact with our website; and preference cookies to remember your settings.',
      'Essential Cookies\nThese cookies are necessary for the website to function and cannot be switched off. They are usually set in response to actions you take such as logging in or filling in forms.',
      'Analytics Cookies\nWe use analytics tools to collect anonymous information about how visitors use our site. This helps us improve our platform and user experience.',
      'Managing Cookies\nYou can control and delete cookies through your browser settings. Disabling certain cookies may affect the functionality of the platform.',
      `Contact Us\nIf you have questions about our cookie practices, please email ${CONTACT_EMAIL}.`,
    ],
  },
];
