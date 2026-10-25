interface AuthRememberRowProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
}

export default function AuthRememberRow({
    checked,
    onChange,
    label = 'Ghi nhớ tài khoản',
}: AuthRememberRowProps) {
    return (
        <label className="remember-row login-remember-row remember-row-compact" title={label}>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span>{label}</span>
        </label>
    );
}