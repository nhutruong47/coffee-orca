interface AuthFieldProps {
    id: string;
    label: string;
    type?: string;
    value: string;
    placeholder: string;
    autoComplete?: string;
    icon: React.ReactNode;
    rightSlot?: React.ReactNode;
    onChange: (value: string) => void;
}

export default function AuthField({
    id,
    label,
    type = 'text',
    value,
    placeholder,
    autoComplete,
    icon,
    rightSlot,
    onChange,
}: AuthFieldProps) {
    return (
        <div className="login-field">
            <label htmlFor={id}>{label}</label>
            <div className="login-input-wrap">
                <span className="login-input-icon">{icon}</span>
                <input
                    id={id}
                    type={type}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete={autoComplete}
                    className={rightSlot ? 'password-input' : undefined}
                />
                {rightSlot}
            </div>
        </div>
    );
}