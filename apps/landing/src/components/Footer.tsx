import { useState } from 'react';

const LINKS = {
  Product: ['Features', 'How It Works', 'For Hospitals', 'For Staff'],
  Legal:   ['Privacy Policy', 'Terms of Service', 'Cookie Policy'],
};

const POLICY_CONTENT: Record<string, { title: string; body: string[] }> = {
  'Privacy Policy': {
    title: 'Privacy Policy',
    body: [
      'Last updated: January 2025',
      'Covershift ("we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and share information about you when you use our platform.',
      'Information We Collect\nWe collect information you provide directly to us — such as your name, email address, phone number, professional credentials, and payment details when you register or use our services.',
      'How We Use Your Information\nWe use the information we collect to provide, maintain, and improve our services; to process transactions; to send you technical notices and support messages; and to respond to your comments and questions.',
      'Information Sharing\nWe do not sell your personal information. We may share your information with hospitals and healthcare facilities as necessary to facilitate shift bookings, and with service providers who assist in our operations.',
      'Data Security\nWe implement appropriate technical and organisational measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction.',
      'Contact Us\nIf you have any questions about this Privacy Policy, please contact us at info@covershift.com.',
    ],
  },
  'Terms of Service': {
    title: 'Terms of Service',
    body: [
      'Last updated: January 2025',
      'By accessing or using Covershift, you agree to be bound by these Terms of Service. Please read them carefully.',
      'Use of the Platform\nCovershift provides a platform connecting healthcare facilities with medical professionals for temporary staffing purposes. You must be at least 18 years old and legally permitted to work in India to use our services.',
      'User Responsibilities\nYou are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to provide accurate and complete information when registering.',
      'Healthcare Professionals\nMedical professionals using Covershift must hold valid, current credentials and licences as required by law. You are solely responsible for maintaining and updating your professional qualifications.',
      'Healthcare Facilities\nFacilities using Covershift are responsible for verifying staff credentials independently and ensuring compliance with all applicable healthcare regulations.',
      'Limitation of Liability\nCovershift is a technology platform and is not responsible for the quality of medical services provided. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.',
      'Contact Us\nFor questions about these Terms, contact us at info@covershift.com.',
    ],
  },
  'Cookie Policy': {
    title: 'Cookie Policy',
    body: [
      'Last updated: January 2025',
      'This Cookie Policy explains how Covershift uses cookies and similar tracking technologies when you visit our website.',
      'What Are Cookies\nCookies are small text files stored on your device when you visit a website. They help us provide you with a better experience by remembering your preferences and understanding how you use our platform.',
      'How We Use Cookies\nWe use essential cookies required for the platform to function; analytics cookies to understand how visitors interact with our website; and preference cookies to remember your settings.',
      'Essential Cookies\nThese cookies are necessary for the website to function and cannot be switched off. They are usually set in response to actions you take such as logging in or filling in forms.',
      'Analytics Cookies\nWe use analytics tools to collect anonymous information about how visitors use our site. This helps us improve our platform and user experience.',
      'Managing Cookies\nYou can control and delete cookies through your browser settings. Disabling certain cookies may affect the functionality of the platform.',
      'Contact Us\nIf you have questions about our cookie practices, please email info@covershift.com.',
    ],
  },
};

function PolicyModal({ policy, onClose }: { policy: string; onClose: () => void }) {
  const content = POLICY_CONTENT[policy];
  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-line flex-shrink-0">
          <h2 className="font-display font-extrabold text-[18px] text-ink">{content.title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-paper hover:bg-sky flex items-center justify-center transition-colors text-slate hover:text-navy"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-6 space-y-5">
          {content.body.map((para, i) => {
            const [heading, ...rest] = para.split('\n');
            return rest.length > 0 ? (
              <div key={i}>
                <p className="font-bold text-[13.5px] text-ink mb-1">{heading}</p>
                <p className="text-[13.5px] text-slate leading-relaxed">{rest.join('\n')}</p>
              </div>
            ) : (
              <p key={i} className={`text-[13.5px] leading-relaxed ${i === 0 ? 'text-slate/60 text-[12px]' : 'text-slate'}`}>{para}</p>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-[10px] rounded-[10px] bg-navy text-white font-bold text-[13.5px] hover:bg-navy-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Footer() {
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);

  return (
    <>
      <footer className="bg-navy-4 text-white">
        <div className="container-lg px-6 md:px-10 lg:px-16 pt-16 pb-8">
          {/* Top grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-2">
              <img src="/brand/covershift-logo-dark.svg" alt="CoverShift" className="h-[40px] w-auto mb-4" />
              <p className="text-[13.5px] text-white/60 leading-relaxed max-w-[300px] mb-6">
                India's smartest healthcare staffing platform — connecting hospitals with verified medical professionals instantly.
              </p>
              {/* Contact */}
              <div className="space-y-2">
                <a href="mailto:info@covershift.com" className="flex items-center gap-2 text-[13px] text-white/60 hover:text-white transition-colors">
                  <span className="text-sky-3">✉</span> info@covershift.com
                </a>
                <a href="tel:+919999999999" className="flex items-center gap-2 text-[13px] text-white/60 hover:text-white transition-colors">
                  <span className="text-sky-3">📞</span> +91 99999 99999
                </a>
                <p className="flex items-center gap-2 text-[13px] text-white/60">
                  <span className="text-sky-3">📍</span> Pune, Maharashtra, India
                </p>
              </div>
            </div>

            {/* Link columns */}
            {Object.entries(LINKS).map(([section, items]) => (
              <div key={section}>
                <h4 className="font-display font-bold text-[12px] uppercase tracking-widest text-white/40 mb-4">
                  {section}
                </h4>
                <ul className="space-y-3">
                  {items.map((item) => {
                    const isPolicy = section === 'Legal';
                    return (
                      <li key={item}>
                        {isPolicy ? (
                          <button
                            onClick={() => setOpenPolicy(item)}
                            className="text-[13.5px] text-white/60 hover:text-white transition-colors text-left"
                          >
                            {item}
                          </button>
                        ) : (
                          <a href="#" className="text-[13.5px] text-white/60 hover:text-white transition-colors">
                            {item}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-[12.5px] text-white/40">
              © {new Date().getFullYear()} Covershift. All rights reserved.
            </p>
            <div className="flex items-center gap-1 text-[12.5px] text-white/40">
              <span className="w-2 h-2 rounded-full bg-success inline-block mr-1" />
              All systems operational
            </div>
          </div>
        </div>
      </footer>

      {openPolicy && (
        <PolicyModal policy={openPolicy} onClose={() => setOpenPolicy(null)} />
      )}
    </>
  );
}
