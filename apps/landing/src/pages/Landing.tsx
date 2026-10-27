import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// ─── Phone Mockup ────────────────────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="relative mx-auto" style={{ width: 240 }}>
      {/* Glow */}
      <div className="absolute inset-0 rounded-[44px] bg-sky-3/30 blur-3xl scale-110" />
      {/* Phone frame */}
      <div className="relative bg-navy-3 rounded-[40px] p-[10px] shadow-2xl border border-white/10">
        <div className="bg-[#0D1F2D] rounded-[32px] overflow-hidden" style={{ height: 490 }}>
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-white/50 text-[10px]">9:41</span>
            <div className="w-24 h-[14px] bg-[#0D1F2D] rounded-full border border-white/10" />
            <div className="flex gap-1">
              <div className="w-3 h-[6px] rounded-sm bg-white/40" />
              <div className="w-1 h-[6px] rounded-sm bg-sky-3" />
            </div>
          </div>
          {/* App header */}
          <div className="px-5 pb-3">
            <p className="text-white/40 text-[10px] font-semibold mb-[2px]">AVAILABLE SHIFTS</p>
            <p className="text-white text-[14px] font-display font-bold">Good morning, Dr. Rao 👋</p>
          </div>
          {/* Shift cards */}
          {[
            { hospital: 'Apollo Hospital', specialty: 'Emergency Med', pay: '₹9,500', time: 'Today · 8AM–4PM', urgent: true },
            { hospital: 'Sunrise Clinic', specialty: 'General Medicine', pay: '₹7,000', time: 'Tomorrow · 9AM–5PM', urgent: false },
            { hospital: 'City Care', specialty: 'Paediatrics', pay: '₹6,500', time: 'Wed · 10AM–6PM', urgent: false },
          ].map((shift, i) => (
            <div key={i} className="mx-4 mb-3 bg-white/5 rounded-2xl p-3 border border-white/8">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-white text-[11px] font-bold">{shift.hospital}</p>
                  <p className="text-white/50 text-[10px]">{shift.specialty}</p>
                </div>
                {shift.urgent && (
                  <span className="text-[9px] font-bold bg-red-500/20 text-red-400 px-2 py-[2px] rounded-full">Urgent</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sky-3 text-[11px] font-bold">{shift.pay}</p>
                <p className="text-white/40 text-[9px]">{shift.time}</p>
              </div>
            </div>
          ))}
          {/* Bottom nav bar */}
          <div className="absolute bottom-4 left-[10px] right-[10px] bg-white/5 rounded-2xl mx-2 px-4 py-2 flex justify-around border border-white/10">
            {['🏠', '🩺', '📋', '💰', '👤'].map((icon, i) => (
              <div key={i} className={`text-[18px] ${i === 1 ? 'opacity-100' : 'opacity-30'}`}>{icon}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Mockup ─────────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-navy/10 rounded-3xl blur-2xl" />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-line overflow-hidden">
        {/* Top bar */}
        <div className="bg-navy-3 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/brand/covershift-icon-on-dark.svg" alt="" className="w-5 h-5" />
            <span className="text-white text-[11px] font-bold">CoverShift · Admin</span>
          </div>
          <div className="flex gap-1">
            {['#ff5f57','#ffbd2e','#28c840'].map(c => <div key={c} className="w-2 h-2 rounded-full" style={{background:c}}/>)}
          </div>
        </div>
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-4">
          {[
            { label: 'Total Shifts', value: '24', delta: '+8 this month', color: 'text-navy' },
            { label: 'Filled Shifts', value: '18', delta: '75% fill rate', color: 'text-success' },
            { label: 'Unfilled', value: '6', delta: '2 urgent', color: 'text-urgent' },
            { label: 'Active Staff', value: '31', delta: '+5 this month', color: 'text-navy-2' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-paper rounded-xl p-3">
              <p className="text-[9px] text-slate font-semibold mb-1">{kpi.label}</p>
              <p className={`text-[18px] font-display font-extrabold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[8px] text-slate mt-[2px]">{kpi.delta}</p>
            </div>
          ))}
        </div>
        {/* Mini table */}
        <div className="px-4 pb-4">
          <p className="text-[10px] font-bold text-slate mb-2">URGENT SHIFTS</p>
          <div className="rounded-lg border border-line overflow-hidden">
            {[
              { shift: 'ER Night Cover', loc: 'Kothrud', specialty: 'Emergency', status: 'Unfilled' },
              { shift: 'ICU Morning', loc: 'Viman Nagar', specialty: 'ICU', status: 'Pending' },
              { shift: 'OT Assist', loc: 'Wakad', specialty: 'Surgery', status: 'Unfilled' },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-0 text-[9px]">
                <p className="font-semibold text-ink flex-1 min-w-0 truncate">{row.shift}</p>
                <p className="text-slate hidden sm:block">{row.loc}</p>
                <p className="text-slate hidden sm:block">{row.specialty}</p>
                <span className={`px-2 py-[2px] rounded-full font-bold flex-shrink-0 ${row.status === 'Unfilled' ? 'bg-urgent/10 text-urgent' : 'bg-warning/10 text-warning'}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Hero ────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #071E2E 0%, #0F3D5C 55%, #175E86 100%)' }}>
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      {/* Radial glow */}
      <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #5FB4E0 0%, transparent 70%)' }} />

      <div className="container-lg px-6 md:px-10 lg:px-16 pt-24 pb-16 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div className="animate-fade-up">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-[6px] mb-7">
              <span className="w-2 h-2 rounded-full bg-sky-3 animate-pulse" />
              <span className="text-white/80 text-[12px] font-semibold">Healthcare Staffing Platform · India</span>
            </div>
            {/* Headline */}
            <h1 className="font-display font-black text-[40px] sm:text-[52px] md:text-[58px] leading-[1.07] text-white mb-5 tracking-tight">
              Fill Every Shift,<br />
              <span style={{ background: 'linear-gradient(90deg, #5FB4E0, #EAF2F8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Every Time.
              </span>
            </h1>
            {/* Subheadline */}
            <p className="text-[15px] md:text-[16.5px] text-white/65 leading-relaxed max-w-[480px] mb-9">
              Covershift connects hospitals and clinics with verified doctors, nurses, and medical staff — instantly. Post a shift in minutes and get qualified applicants the same day.
            </p>
            {/* CTAs */}
            <div className="flex flex-wrap gap-3 mb-10">
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-white text-navy font-bold text-[14px] px-6 py-[13px] rounded-[12px] hover:bg-sky transition-colors"
              >
                Get Started Free
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 border-[1.5px] border-white/30 text-white font-bold text-[14px] px-6 py-[13px] rounded-[12px] hover:border-white/60 hover:bg-white/5 transition-colors"
              >
                See How It Works
              </a>
            </div>
            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-5">
              {[
                { icon: '✓', text: 'Credential-verified staff' },
                { icon: '✓', text: 'Same-day placements' },
                { icon: '✓', text: 'No placement fees' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-[6px] text-[12.5px] text-white/60">
                  <span className="text-sky-3 font-bold">{icon}</span>
                  {text}
                </div>
              ))}
            </div>
          </div>

          {/* Right — Phone mockup (hidden on small screens) */}
          <div className="hidden lg:flex justify-center items-center">
            <PhoneMockup />
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 60V30C240 0 480 0 720 20C960 40 1200 40 1440 20V60H0Z" fill="#F5F8FA"/>
        </svg>
      </div>
    </section>
  );
}

// ─── Section: Stats ───────────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { value: '500+',  label: 'Shifts Posted',        icon: '📋' },
    { value: '1,200+',label: 'Verified Professionals',icon: '👨‍⚕️' },
    { value: '150+',  label: 'Hospitals & Clinics',  icon: '🏥' },
    { value: '95%',   label: 'Shift Fill Rate',      icon: '✅' },
  ];

  return (
    <section className="bg-paper py-12">
      <div className="container-lg px-6 md:px-10 lg:px-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(({ value, label, icon }) => (
            <div key={label} className="text-center">
              <div className="text-3xl mb-2">{icon}</div>
              <p className="font-display font-extrabold text-[28px] sm:text-[32px] text-navy">{value}</p>
              <p className="text-[12px] sm:text-[13px] text-slate mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: How It Works ────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Hospital Posts a Shift',
      desc: 'Fill in shift details — specialty, date, time, and pay rate. Set requirements and publish in under 2 minutes.',
      icon: '📋',
    },
    {
      num: '02',
      title: 'Verified Staff Apply',
      desc: 'Qualified, credential-verified doctors and nurses get notified instantly. They apply with one tap on the mobile app.',
      icon: '👨‍⚕️',
    },
    {
      num: '03',
      title: 'Confirm & Done',
      desc: 'Review applicants, confirm the best fit, and the shift is covered. The staff member gets notified immediately.',
      icon: '✅',
    },
  ];

  return (
    <section id="how-it-works" className="section-pad bg-white">
      <div className="container-lg">
        {/* Heading */}
        <div className="text-center mb-12">
          <span className="inline-block text-[12px] font-bold tracking-widest uppercase text-navy-2 bg-sky px-4 py-2 rounded-full mb-4">How It Works</span>
          <h2 className="font-display font-extrabold text-[30px] sm:text-[36px] md:text-[42px] text-ink leading-tight mb-4">
            From posting to confirmed<br />in minutes — not days.
          </h2>
          <p className="text-[15px] text-slate max-w-[520px] mx-auto">
            A simple, streamlined process that eliminates the back-and-forth of traditional healthcare staffing.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* Connector line — desktop only */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-[2px] bg-gradient-to-r from-line via-sky-3/40 to-line" />

          {steps.map(({ num, title, desc, icon }, i) => (
            <div key={num} className="relative bg-paper rounded-2xl p-6 border border-line hover:border-navy/20 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center flex-shrink-0">
                  <span className="font-display font-black text-[13px] text-white">{num}</span>
                </div>
                <span className="text-2xl">{icon}</span>
              </div>
              <h3 className="font-display font-bold text-[16px] text-ink mb-3">{title}</h3>
              <p className="text-[14px] text-slate leading-relaxed">{desc}</p>
              {i < steps.length - 1 && (
                <div className="md:hidden absolute -bottom-3 left-1/2 -translate-x-1/2 text-slate">↓</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: For Hospitals ───────────────────────────────────────────────────
function ForHospitals() {
  const features = [
    { icon: '⚡', title: 'Post Shifts in Minutes',   desc: 'Create and publish shifts with custom requirements, pay rates, and visibility settings from a clean web dashboard.' },
    { icon: '🛡️', title: 'Verified Staff Only',       desc: 'Every professional on Covershift has verified credentials. Access qualification, experience, and reviews before confirming.' },
    { icon: '📊', title: 'Real-time Analytics',       desc: 'Track fill rates, shift volume, locum spend, and compliance reports. Know exactly how your staffing is performing.' },
    { icon: '📄', title: 'Document Management',       desc: 'Auto-expiry alerts, centralized credential storage, and one-click verification for all staff documents.' },
    { icon: '🔔', title: 'Instant Notifications',     desc: 'Staff are notified the moment your shift is published. Urgent shifts go to the top and get filled fastest.' },
    { icon: '👥', title: 'Multi-facility Support',    desc: 'Manage multiple hospital locations from a single admin account with role-based access for your team.' },
  ];

  return (
    <section id="hospitals" className="section-pad" style={{ background: 'linear-gradient(180deg, #F5F8FA 0%, #EAF2F8 100%)' }}>
      <div className="container-lg">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — mockup */}
          <div className="order-2 lg:order-1">
            <DashboardMockup />
          </div>

          {/* Right — content */}
          <div className="order-1 lg:order-2">
            <span className="inline-block text-[12px] font-bold tracking-widest uppercase text-navy-2 bg-white border border-line px-4 py-2 rounded-full mb-5">For Hospitals & Clinics</span>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] md:text-[40px] text-ink leading-tight mb-4">
              Run your staffing like a<br />well-oiled machine.
            </h2>
            <p className="text-[15px] text-slate mb-8 leading-relaxed">
              Stop chasing staff through WhatsApp groups. Covershift gives your admin team a powerful dashboard to manage every shift, booking, and document in one place.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-9">
              {features.map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-3">
                  <span className="text-xl flex-shrink-0 mt-[2px]">{icon}</span>
                  <div>
                    <p className="font-bold text-[13.5px] text-ink mb-1">{title}</p>
                    <p className="text-[12.5px] text-slate leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="#"
              className="inline-flex items-center gap-2 bg-navy text-white font-bold text-[14px] px-6 py-[13px] rounded-[12px] hover:bg-navy-2 transition-colors"
            >
              Start Managing Shifts
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section: For Staff ───────────────────────────────────────────────────────
function ForStaff() {
  const features = [
    { icon: '🩺', title: 'Browse Available Shifts',  desc: 'Filter by specialty, location, date, and pay rate. Find shifts that fit your schedule and preferences.' },
    { icon: '⚡', title: 'Apply Instantly',           desc: 'One-tap application directly from your phone. Get confirmed and receive all shift details immediately.' },
    { icon: '💰', title: 'Transparent Pay Rates',    desc: 'Every shift shows the exact pay rate upfront. No hidden fees, no surprises — what you see is what you get.' },
    { icon: '📅', title: 'Manage Your Availability', desc: 'Set your working days and hours. Covershift only shows you shifts that match your availability.' },
    { icon: '📈', title: 'Track Your Earnings',       desc: 'Full payment history, pending payments, and monthly earnings summary — all in your dashboard.' },
    { icon: '📄', title: 'Credential Management',    desc: 'Upload your documents once. Keep everything organised and get notified before anything expires.' },
  ];

  return (
    <section id="staff" className="section-pad bg-white">
      <div className="container-lg">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — content */}
          <div>
            <span className="inline-block text-[12px] font-bold tracking-widest uppercase text-navy-2 bg-sky px-4 py-2 rounded-full mb-5">For Doctors, Nurses & Medical Staff</span>
            <h2 className="font-display font-extrabold text-[28px] sm:text-[34px] md:text-[40px] text-ink leading-tight mb-4">
              Your career,<br />on your terms.
            </h2>
            <p className="text-[15px] text-slate mb-8 leading-relaxed">
              Covershift puts you in control. Pick shifts that suit your schedule, earn transparently, and build your reputation across India's top hospitals and clinics.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-9">
              {features.map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-3">
                  <span className="text-xl flex-shrink-0 mt-[2px]">{icon}</span>
                  <div>
                    <p className="font-bold text-[13.5px] text-ink mb-1">{title}</p>
                    <p className="text-[12.5px] text-slate leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Download buttons */}
            <div className="flex flex-wrap gap-3">
              <a href="#" className="inline-flex items-center gap-3 bg-ink text-white font-semibold text-[13px] px-5 py-[11px] rounded-[11px] hover:bg-navy-3 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                App Store
                <span className="text-white/40 text-[11px]">Coming Soon</span>
              </a>
              <a href="#" className="inline-flex items-center gap-3 bg-ink text-white font-semibold text-[13px] px-5 py-[11px] rounded-[11px] hover:bg-navy-3 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.34.19.72.24 1.1.14l12.04-6.95L13.23 14l-10.05 9.76zm-1.18-21c-.05.22-.08.47-.08.73v19.02c0 .26.03.51.08.73L13.04 12 2 2.76zM20.67 10.5l-2.45-1.41-3.21 3.12 3.21 3.12 2.46-1.42c.7-.4.7-1.41-.01-1.81zM4.28.1L16.32 7.05 13.23 10 3.18.24C3.52.04 3.94.01 4.28.1z"/></svg>
                Google Play
                <span className="text-white/40 text-[11px]">Coming Soon</span>
              </a>
            </div>
          </div>

          {/* Right — phone mockup */}
          <div className="flex justify-center">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section: Features Grid ───────────────────────────────────────────────────
function FeaturesGrid() {
  const items = [
    { icon: '🔒', title: 'Secure & Compliant',      desc: 'End-to-end data encryption, role-based access control, and full compliance with healthcare data standards.' },
    { icon: '⚡', title: 'Same-day Placements',     desc: 'Our average time from shift posting to confirmed staff is under 3 hours.' },
    { icon: '📱', title: 'Mobile-first for Staff',  desc: 'The Covershift app for iOS and Android lets staff apply, track, and manage everything on the go.' },
    { icon: '🌐', title: 'Web Dashboard for Admins',desc: 'A powerful, clean admin panel for hospitals — manage shifts, staff, bookings, and documents.' },
    { icon: '🔔', title: 'Real-time Notifications', desc: 'Push notifications, in-app alerts, and email updates keep everyone in the loop instantly.' },
    { icon: '📊', title: 'Data & Analytics',        desc: 'Fill rates, spend tracking, compliance reports, and top-performer dashboards built in.' },
  ];

  return (
    <section id="features" className="section-pad bg-paper">
      <div className="container-lg">
        <div className="text-center mb-12">
          <span className="inline-block text-[12px] font-bold tracking-widest uppercase text-navy-2 bg-sky px-4 py-2 rounded-full mb-4">Platform Features</span>
          <h2 className="font-display font-extrabold text-[30px] sm:text-[36px] md:text-[42px] text-ink leading-tight mb-4">
            Everything you need,<br />nothing you don't.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(({ icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl p-6 border border-line hover:border-navy/20 hover:shadow-lg transition-all group">
              <div className="w-11 h-11 rounded-xl bg-sky flex items-center justify-center text-xl mb-4 group-hover:bg-sky-2 transition-colors">
                {icon}
              </div>
              <h3 className="font-display font-bold text-[16px] text-ink mb-2">{title}</h3>
              <p className="text-[13.5px] text-slate leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Testimonials ────────────────────────────────────────────────────
function Testimonials() {
  const quotes = [
    {
      quote: "We used to fill emergency shifts through WhatsApp groups at 11pm. With Covershift, I post a shift and get 3 applicants within the hour. It's transformed how we operate.",
      name: 'Dr. Suresh Patil',
      title: 'Medical Director, Apollo Hospital Pune',
      initials: 'SP',
    },
    {
      quote: "I do locum shifts between my regular job. Covershift lets me see exactly which shifts are available near me, what they pay, and apply instantly. I've doubled my extra income.",
      name: 'Dr. Ananya Rao',
      title: 'Emergency Medicine Physician',
      initials: 'AR',
    },
    {
      quote: "Document verification used to take us days. Now our HR uploads once and it's verified. The compliance reports save us hours every month.",
      name: 'Priya Menon',
      title: 'HR Manager, CityCare Clinic',
      initials: 'PM',
    },
  ];

  return (
    <section className="section-pad" style={{ background: 'linear-gradient(180deg, #EAF2F8 0%, #F5F8FA 100%)' }}>
      <div className="container-lg">
        <div className="text-center mb-12">
          <span className="inline-block text-[12px] font-bold tracking-widest uppercase text-navy-2 bg-white border border-line px-4 py-2 rounded-full mb-4">Testimonials</span>
          <h2 className="font-display font-extrabold text-[30px] sm:text-[36px] md:text-[42px] text-ink leading-tight">
            Trusted by healthcare<br />teams across India.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map(({ quote, name, title, initials }) => (
            <div key={name} className="bg-white rounded-2xl p-6 border border-line shadow-sm hover:shadow-md transition-shadow">
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array(5).fill(0).map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#B8862E"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                ))}
              </div>
              <p className="text-[13.5px] text-slate leading-relaxed mb-6 italic">"{quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-sky flex items-center justify-center font-bold text-[12px] text-navy flex-shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="font-bold text-[13px] text-ink">{name}</p>
                  <p className="text-[11.5px] text-slate">{title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section: Final CTA ───────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="section-pad" style={{ background: 'linear-gradient(135deg, #0B2D45 0%, #0F3D5C 60%, #175E86 100%)' }}>
      <div className="container-lg text-center px-6">
        {/* ECG decoration */}
        <div className="flex justify-center mb-8">
          <svg width="120" height="36" viewBox="0 0 120 36" fill="none">
            <path d="M0 18h20l8-14 10 28 8-18 6 10 4-6h64" stroke="#5FB4E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
          </svg>
        </div>
        <h2 className="font-display font-black text-[32px] sm:text-[40px] md:text-[52px] text-white leading-tight mb-5 tracking-tight">
          Ready to transform your<br />healthcare staffing?
        </h2>
        <p className="text-[15px] md:text-[17px] text-white/60 max-w-[480px] mx-auto mb-10 leading-relaxed">
          Join hospitals and medical professionals already using Covershift to fill shifts faster, smarter, and stress-free.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="#"
            className="inline-flex items-center gap-2 bg-white text-navy font-bold text-[14px] md:text-[15px] px-6 md:px-8 py-[13px] md:py-[14px] rounded-[12px] hover:bg-sky transition-colors"
          >
            Get Started Free — For Hospitals
          </a>
          <a
            href="#staff"
            className="inline-flex items-center gap-2 border-[1.5px] border-white/30 text-white font-bold text-[14px] md:text-[15px] px-6 md:px-8 py-[13px] md:py-[14px] rounded-[12px] hover:border-white/60 hover:bg-white/5 transition-colors"
          >
            Download App — For Staff
          </a>
        </div>
        <p className="text-[12px] text-white/30 mt-6">No credit card required · Free to get started · Set up in minutes</p>
      </div>
    </section>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <Stats />
      <HowItWorks />
      <ForHospitals />
      <ForStaff />
      <FeaturesGrid />
      <Testimonials />
      <FinalCTA />
      <Footer />
    </div>
  );
}
