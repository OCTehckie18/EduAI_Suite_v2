import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthPage } from './AuthPage';

// Mock dependencies
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: () => <button data-testid="google-login">Mock Google Login</button>,
}));

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({
    googleLogin: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe('AuthPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the auth page with google login button', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );

    // Verify Welcome Text
    expect(screen.getByText('Welcome, Student!')).toBeInTheDocument();
    
    // Verify Google Login Mock Button is present
    expect(screen.getByTestId('google-login')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Register number or email')).not.toBeInTheDocument();
  });

  it('shows saved credentials after Google login has been used', () => {
    localStorage.setItem('eduai.edugames.google-login-seen', 'true');

    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText('Register number or email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });
});
