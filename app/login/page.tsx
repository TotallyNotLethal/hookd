'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginModal } from '@/components/auth/LoginModalContext';

export default function Page() {
  const { isOpen, openModal } = useLoginModal();
  const router = useRouter();
  const hasOpenedRef = useRef(false);

  useEffect(() => {
    if (hasOpenedRef.current) {
      return;
    }
    hasOpenedRef.current = true;
    openModal();
  }, [openModal]);

  useEffect(() => {
    if (!hasOpenedRef.current) {
      return;
    }

    if (!isOpen) {
      router.replace('/');
    }
  }, [isOpen, router]);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center text-white/70">
        <p>If you aren&apos;t redirected automatically, use the button below to open the sign-in modal.</p>
        <button type="button" onClick={openModal} className="btn-primary mt-6">
          Open sign-in modal
        </button>
      </div>
    </main>
  );
}
