import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authService } from '../services/authService';
import type { UserInfo, LoginRequest, RegisterRequest } from '../types/types';

interface AuthContextType {
    user: UserInfo | null;
    userId: string;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (data: LoginRequest) => Promise<void>;
    register: (data: RegisterRequest) => Promise<void>;
    logout: () => void;
    fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    const isAuthenticated = !!token && !!user;

    // Verify token on mount
    useEffect(() => {
        const verifyToken = async () => {
            const savedToken = sessionStorage.getItem('token');
            if (!savedToken) {
                setIsLoading(false);
                return;
            }

            try {
                const userInfo = await authService.getMe();
                setUser(userInfo);
                setToken(savedToken);
            } catch {
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('user');
                setToken(null);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        verifyToken();
    }, []);

    const login = useCallback(async (data: LoginRequest) => {
        const response = await authService.login(data);
        sessionStorage.setItem('token', response.token);
        setToken(response.token);

        const userInfo = await authService.getMe();
        setUser(userInfo);
        sessionStorage.setItem('user', JSON.stringify(userInfo));
    }, []);

    const register = useCallback(async (data: RegisterRequest) => {
        const response = await authService.register(data);
        sessionStorage.setItem('token', response.token);
        setToken(response.token);

        const userInfo = await authService.getMe();
        setUser(userInfo);
        sessionStorage.setItem('user', JSON.stringify(userInfo));
    }, []);

    const logout = useCallback(() => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        setToken(null);
        setUser(null);
    }, []);

    const fetchUser = useCallback(async () => {
        try {
            const userInfo = await authService.getMe();
            setUser(userInfo);
            sessionStorage.setItem('user', JSON.stringify(userInfo));
        } catch (error) {
            setUser(null);
            sessionStorage.removeItem('user');
        }
    }, []);

    const userId = user?.id ?? '';

    return (
        <AuthContext.Provider value={{ user, userId, token, isAuthenticated, isLoading, login, register, logout, fetchUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
