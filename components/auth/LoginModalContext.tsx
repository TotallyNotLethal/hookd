'use client';

import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import LoginModal, { LOGIN_REDIRECT_STORAGE_KEY } from './LoginModal';

interface LoginModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const LoginModalContext = createContext<LoginModalContextValue | undefined>(undefined);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY) === '1';
  });

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      openModal,
      closeModal,
    }),
    [closeModal, isOpen, openModal],
  );

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      <LoginModal open={isOpen} onClose={closeModal} />
    </LoginModalContext.Provider>
  );
}

export function useLoginModal() {
  const context = useContext(LoginModalContext);
  if (!context) {
    throw new Error('useLoginModal must be used within a LoginModalProvider');
  }
  return context;
}
