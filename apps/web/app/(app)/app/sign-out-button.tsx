'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
      }}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid #ccc',
        background: '#fff',
        cursor: 'pointer',
      }}
    >
      {t(DEFAULT_LOCALE, 'app.signout')}
    </button>
  );
}
