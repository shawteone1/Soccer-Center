/**
 * Parent Portal shared primitives — blue/white/grey design system.
 * All components use pp-* CSS classes from globals.css (scoped to .pp-shell).
 * No green semantic tokens used here.
 */

import { useId } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function PpAvatar({
  initials,
  photoUrl,
  size = 'md',
  className = '',
  style,
}: {
  initials: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}) {
  const sizeMap = {
    sm:  'h-8 w-8 text-xs',
    md:  'h-10 w-10 text-sm',
    lg:  'h-14 w-14 text-lg',
    xl:  'h-20 w-20 text-2xl',
  };
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={initials}
        className={`pp-avatar ${sizeMap[size]} ${className} object-cover`}
        style={style}
      />
    );
  }
  return (
    <div
      className={`pp-avatar ${sizeMap[size]} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Chip (toggle) ────────────────────────────────────────────────────────────

export function PpChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`pp-chip${active ? ' active' : ''}`}
    >
      {active && <CheckCircle size={10} className="shrink-0" />}
      {icon && !active && <span className="shrink-0">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function PpCard({
  children,
  className = '',
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div className={`pp-card${padding ? ' p-5' : ''} ${className}`}>
      {children}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

export function PpSectionHeading({
  children,
  action,
  icon,
  title,
}: {
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}) {
  const label = title ?? children;
  return (
    <div className="sc-section-heading flex items-center justify-between mb-4">
      <h3
        className="text-sm font-semibold flex items-center gap-1.5"
        style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}
      >
        {icon}
        {label}
      </h3>
      {action}
    </div>
  );
}

// ─── Primary button ───────────────────────────────────────────────────────────

export function PpButton({
  children,
  onClick,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  'data-testid': dataTestId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  className?: string;
  'data-testid'?: string;
}) {
  const base = variant === 'primary' ? 'pp-btn-primary' : variant === 'outline' ? 'pp-btn-outline' : '';
  const sizeClass = size === 'sm' ? 'text-xs py-1.5 px-3' : '';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`sc-control ${base} ${sizeClass} ${className}`}
      data-testid={dataTestId}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function PpInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-1.5"
        style={{ color: 'hsl(var(--pp-text))' }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
        style={{
          borderColor: 'hsl(var(--pp-border))',
          background: 'hsl(var(--pp-page-bg))',
          color: 'hsl(var(--pp-text))',
        }}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs mt-1" style={{ color: 'hsl(var(--pp-text-muted))' }}>{hint}</p>
      )}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

export function PpSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-1.5"
        style={{ color: 'hsl(var(--pp-text))' }}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
        style={{
          borderColor: 'hsl(var(--pp-border))',
          background: 'hsl(var(--pp-page-bg))',
          color: 'hsl(var(--pp-text))',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

export function PpToggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium" style={{ color: 'hsl(var(--pp-text))' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pp-text-muted))' }}>{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none"
        style={{ background: checked ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-border))' }}
      >
        <span
          className="pointer-events-none inline-block h-5 w-5 rounded-full shadow transform transition-transform"
          style={{ background: 'hsl(var(--pp-white))', transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

export function PpStatCard({
  value,
  label,
  icon,
}: {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="pp-card p-4 flex flex-col items-center text-center gap-1">
      {icon && (
        <div className="mb-1" style={{ color: 'hsl(var(--pp-blue))' }}>{icon}</div>
      )}
      <p
        className="text-2xl font-bold"
        style={{ color: 'hsl(var(--pp-navy))', fontFamily: 'var(--font-heading)' }}
      >
        {value}
      </p>
      <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>{label}</p>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function PpBadge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'info' | 'error';
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' },
    success: { background: 'hsl(var(--pp-badge-success-bg))', color: 'hsl(var(--pp-badge-success-fg))' },
    warning: { background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' },
    info:    { background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-blue))' },
    error:   { background: 'hsl(var(--pp-badge-error-bg))', color: 'hsl(var(--pp-badge-error-fg))' },
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={styles[variant]}
    >
      {children}
    </span>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function PpDivider() {
  return (
    <hr style={{ borderColor: 'hsl(var(--pp-border))' }} />
  );
}
