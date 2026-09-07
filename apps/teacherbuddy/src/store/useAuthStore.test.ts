import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './useAuthStore';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store state and local storage before each test
    useAuthStore.setState({ user: null, status: null });
    localStorage.clear();
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.status).toBeNull();
  });

  it('should set login state correctly via login', () => {
    const mockUser = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: 'teacher'
    };

    useAuthStore.getState().login(mockUser);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.status).toBe('approved');
  });

  it('should set login state correctly via googleLogin', () => {
    const mockUser = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: 'teacher'
    };

    useAuthStore.getState().googleLogin('fake-jwt-token', mockUser, 'approved');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.status).toBe('approved');
    
    // Check localStorage
    expect(localStorage.getItem('token')).toBe('fake-jwt-token');
    expect(localStorage.getItem('user')).toBe(JSON.stringify({ ...mockUser, status: 'approved' }));
    expect(localStorage.getItem('lastActivity')).not.toBeNull();
  });

  it('should set logout state correctly', () => {
    const mockUser = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      role: 'teacher'
    };
    useAuthStore.getState().googleLogin('fake-jwt-token', mockUser, 'approved');
    
    // Trigger logout
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.status).toBeNull();
    
    // Check localStorage is cleared
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('lastActivity')).toBeNull();
  });
});

