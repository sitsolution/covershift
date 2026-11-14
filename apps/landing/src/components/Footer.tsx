import { CONTACT_EMAIL } from '../legal';

const LINKS: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: 'Features',      href: '/#features' },
    { label: 'How It Works',  href: '/#how-it-works' },
    { label: 'For Hospitals', href: '/#hospitals' },
    { label: 'For Staff',     href: '/#staff' },
  ],
  Legal: [
    { label: 'Privacy Policy',   href: '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy',    href: '/cookie-policy' },
    { label: 'Delete Account',   href: '/delete-account' },
  ],
};

export default function Footer() {
  return (
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
                <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-2 text-[13px] text-white/60 hover:text-white transition-colors">
                  <span className="text-sky-3">✉</span> {CONTACT_EMAIL}
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
                  {items.map(({ label, href }) => (
                    <li key={label}>
                      <a href={href} className="text-[13.5px] text-white/60 hover:text-white transition-colors">
                        {label}
                      </a>
                    </li>
                  ))}
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
  );
}
