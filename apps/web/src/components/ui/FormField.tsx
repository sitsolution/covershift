type Props = {
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  type?: string;
  min?: string;
  error?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function FormField({ label, required, placeholder, defaultValue, value, type = 'text', min, error, onChange }: Props) {
  return (
    <div className="mb-[13px]">
      <label className="block text-[11.5px] font-bold text-slate mb-[6px]">
        {label}{required && <span className="text-urgent ml-[2px]">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={value}
        min={min}
        onChange={onChange}
        className={`w-full px-3 py-[11px] border-[1.4px] rounded-[9px] text-[13px] text-ink outline-none bg-white ${
          error ? 'border-urgent focus:border-urgent' : 'border-line focus:border-navy-2'
        }`}
      />
      {error && <p className="mt-1 text-[11px] text-urgent font-semibold">{error}</p>}
    </div>
  );
}
