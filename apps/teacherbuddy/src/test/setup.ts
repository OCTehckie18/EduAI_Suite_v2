import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  SUPABASE_STORAGE_BUCKET: 'edui-presentations',
}));
