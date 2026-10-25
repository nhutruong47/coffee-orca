import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import './OrcaSelect.css';

export interface OrcaSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface OrcaSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  /** When provided, OrcaSelect renders options for you. Otherwise pass <option> children. */
  options?: OrcaSelectOption[];
  /** Optional placeholder shown when value is empty. */
  placeholder?: string;
  /** Size variation: `md` (default, 42px) or `sm` (compact, 36px). */
  density?: 'md' | 'sm';
  /** Inline label rendered above the field. */
  label?: string;
  /** Stretch to 100% width of parent. */
  fullWidth?: boolean;
  /** Native <option> children are also supported for backward compatibility. */
  children?: ReactNode;
}

export const OrcaSelect = forwardRef<HTMLSelectElement, OrcaSelectProps>(
  ({ options, placeholder, density = 'md', label, fullWidth, className, id, value, children, ...rest }, ref) => {
    const classes = [
      'orca-select-wrap',
      density === 'sm' ? 'orca-select-sm' : '',
      fullWidth ? 'orca-select-full' : '',
      className || '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={classes} style={fullWidth ? undefined : rest.style}>
        {label && (
          <label htmlFor={id} className="orca-select-label">
            {label}
          </label>
        )}
        <div className="orca-select-field" data-filled={value !== '' && value !== undefined && value !== null ? 'true' : 'false'}>
          <select
            ref={ref}
            id={id}
            className="orca-select"
            value={value ?? ''}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled hidden>
                {placeholder}
              </option>
            )}
            {options
              ? options.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="orca-select-chevron" size={16} aria-hidden="true" />
        </div>
      </div>
    );
  },
);

OrcaSelect.displayName = 'OrcaSelect';

export default OrcaSelect;
