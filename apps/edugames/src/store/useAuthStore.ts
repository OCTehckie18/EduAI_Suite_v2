import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserInfo {
  id?: number;
  email: string;
  name: string;
  picture?: string;
}

interface AuthState {
  role: 'teacher' | 'student' | 'admin' | null;
  status: 'pending' | 'approved' | 'denied' | null;
  user: UserInfo | null;
  token: string | null;
  setRole: (role: 'teacher' | 'student') => void;
  googleLogin: (token: string, user: UserInfo, role: string, status: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      status: null,
      user: null,
      token: null,
      setRole: (role) => {
        set({ 
          role,
          status: 'approved',
          user: {
            email: role === 'teacher' ? 'teacher@eduai.com' : 'student@eduai.com',
            name: role === 'teacher' ? 'Teacher' : 'Student'
          }
        });
      },
      googleLogin: (token, user, role, status) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('lastActivity', Date.now().toString());
        set({
          token,
          user,
          role: role as AuthState['role'],
          status: status as AuthState['status'],
        });
      },
      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('lastActivity');
        set({ role: null, status: null, user: null, token: null });
      },
    }),
    {
      name: 'edugames-auth-storage',
    }
  )
);
