import { Component, type ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: unknown) {
        // Surface the failure to the centralised logger so production
        // deployments keep a record without polluting the user's console.
        logger.error('UI crashed:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: '60vh', padding: 40, textAlign: 'center'
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Đã xảy ra lỗi
                    </h2>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, marginBottom: 24 }}>
                        {this.state.error?.message || 'Một lỗi không mong muốn đã xảy ra. Vui lòng thử lại.'}
                    </p>
                    <button
                        onClick={this.handleReset}
                        style={{
                            padding: '10px 28px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                        }}
                    >
                        Thử lại
                    </button>
                    <button
                        onClick={() => window.location.href = '/dashboard'}
                        style={{
                            padding: '10px 28px', borderRadius: 10, border: '1px solid var(--border)',
                            background: 'var(--bg-input)', color: 'var(--text-primary)',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12
                        }}
                    >
                        Về trang chủ
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
