import { create } from 'zustand';

interface UserInfo {
  id?: number;
  email: string;
  name: string;
  picture?: string;
  role?: string;
}

interface AuthState {
  user: UserInfo | null;
  status: 'pending' | 'approved' | 'denied' | null;
  login: (user: UserInfo) => void;
  googleLogin: (token: string, user: UserInfo, status: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Rehydrate from localStorage on init
  let initialUser: UserInfo | null = null;
  let initialStatus: AuthState['status'] = null;
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      initialUser = { 
        id: parsed.id || 1,
        email: parsed.email || parsed.sub || 'teacher@eduai.com', 
        name: parsed.name || 'Teacher',
        picture: parsed.picture,
        role: parsed.role,
      };
      initialStatus = (parsed.status as AuthState['status']) || 'approved';
    }
  } catch (e) {}

  return {
    user: initialUser,
    status: initialStatus,
    login: (user) => set({ user, status: 'approved' }),
    googleLogin: (token, user, status) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ ...user, status }));
      localStorage.setItem('lastActivity', Date.now().toString());
      set({
        user,
        status: status as AuthState['status'],
      });
    },
    logout: () => {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('lastActivity');
      set({ user: null, status: null });
    }
  };
});
