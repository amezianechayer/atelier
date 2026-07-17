'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
      }}
    >
      {t(DEFAULT_LOCALE, 'app.signout')}
    </button>
  );
}
