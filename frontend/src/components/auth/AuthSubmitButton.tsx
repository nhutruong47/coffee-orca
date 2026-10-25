interface AuthSubmitButtonProps {
    id: string;
    isLoading: boolean;
    loadingText: string;
    children: React.ReactNode;
}

export default function AuthSubmitButton({
    id,
    isLoading,
    loadingText,
    children,
}: AuthSubmitButtonProps) {
    return (
        <button
            id={id}
            type="submit"
            className={`login-btn-primary ${isLoading ? 'loading' : ''}`}
            disabled={isLoading}
        >
            {isLoading ? (
                <>
                    <span className="login-spinner" /> {loadingText}
                </>
            ) : (
                children
            )}
        </button>
    );
}