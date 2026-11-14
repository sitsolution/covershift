import SuperAdminLayout from '../../components/layout/SuperAdminLayout';

const SECTIONS = [
  {
    title: 'Platform',
    items: [
      { label: 'Platform Name',    value: 'Covershift'         },
      { label: 'Environment',      value: 'Production'        },
      { label: 'Version',          value: 'v2.0 (Sep 2026)'   },
      { label: 'Support Email',    value: 'covershiftswap@gmail.com' },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Session Timeout',  value: '60 minutes'        },
      { label: 'TLS Version',      value: 'TLS 1.3'           },
      { label: 'Data Encryption',  value: 'AES-256 at rest'   },
      { label: '2FA',              value: 'Deferred (Phase 2)' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { label: 'Activity Logs',    value: 'Immutable — no edits or deletes (NFR-SEC-05)' },
      { label: 'Data Retention',   value: 'Indefinite (configurable per facility)'       },
      { label: 'PII Encryption',   value: 'Enabled'                                      },
    ],
  },
];

export default function SASettings() {
  return (
    <SuperAdminLayout>
      <div className="mb-4">
        <div className="font-display font-extrabold text-[16.5px] text-ink mb-[2px]">
          System Settings
        </div>
        <div className="text-[11.5px] text-slate">
          Platform-level configuration — Super Admin only
        </div>
      </div>

      <div className="px-3 py-[9px] bg-info-bg border border-info rounded-[8px] text-[11.5px] text-info font-semibold mb-4">
        These settings are managed by the platform administrator. Contact Covershift engineering to change core configuration values.
      </div>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="bg-white border border-line rounded-[11px] overflow-hidden">
            <div className="px-4 py-[10px] bg-paper border-b border-line">
              <span className="text-[12px] font-bold text-ink">{section.title}</span>
            </div>
            <div className="divide-y divide-line">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between px-4 py-[11px]">
                  <span className="text-[12px] text-slate font-medium">{item.label}</span>
                  <span className="text-[12px] text-ink font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SuperAdminLayout>
  );
}
