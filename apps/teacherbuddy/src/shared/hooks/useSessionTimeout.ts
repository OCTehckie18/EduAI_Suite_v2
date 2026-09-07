import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useNavigate } from 'react-router-dom';

export function useSessionTimeout(timeoutMs = 900000) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  
  const [remaining, setRemaining] = useState(() => {
    const lastActivityTime = parseInt(localStorage.getItem('lastActivity') || '0', 10);
    if (lastActivityTime === 0) return Math.ceil(timeoutMs / 1000);
    const elapsed = Date.now() - lastActivityTime;
    const timeLeft = Math.max(0, timeoutMs - elapsed);
    return Math.ceil(timeLeft / 1000);
  });

  useEffect(() => {
    if (!user) return;

    if (!localStorage.getItem('lastActivity')) {
      localStorage.setItem('lastActivity', Date.now().toString());
    }

    const checkTimeout = () => {
      const lastActivityTime = parseInt(localStorage.getItem('lastActivity') || '0', 10);
      const elapsed = Date.now() - lastActivityTime;
      if (elapsed > timeoutMs) {
        logout();
        navigate('/login', { replace: true });
        return true;
      }
      return false;
    };

    // Run check immediately on mount
    if (checkTimeout()) return;

    const handleActivity = () => {
      localStorage.setItem('lastActivity', Date.now().toString());
      setRemaining(Math.ceil(timeoutMs / 1000));
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    const intervalId = setInterval(() => {
      if (checkTimeout()) return;
      const lastActivityTime = parseInt(localStorage.getItem('lastActivity') || '0', 10);
      const elapsed = Date.now() - lastActivityTime;
      const timeLeft = Math.max(0, timeoutMs - elapsed);
      setRemaining(Math.ceil(timeLeft / 1000));
    }, 1000); // Check every second to update timer

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(intervalId);
    };
  }, [user, logout, navigate, timeoutMs]);

  return remaining;
}
