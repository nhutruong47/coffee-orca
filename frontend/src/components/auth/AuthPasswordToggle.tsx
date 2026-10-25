interface AuthPasswordToggleProps {
    visible: boolean;
    onToggle: () => void;
    label: string;
}

export default function AuthPasswordToggle({ visible, onToggle, label }: AuthPasswordToggleProps) {
    return (
        <button
            type="button"
            className="password-toggle-btn login-password-toggle"
            onClick={onToggle}
            aria-label={label}
            title={label}
        >
            <ion-icon name={visible ? 'eye-off-outline' : 'eye-outline'}></ion-icon>
        </button>
    );
}