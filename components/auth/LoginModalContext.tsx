'use client';

import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { clearLoginRedirectFlag, readLoginRedirectFlag } from './loginRedirectStorage';
import LoginModal from './LoginModal';

interface LoginModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const LoginModalContext = createContext<LoginModalContextValue | undefined>(undefined);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    return readLoginRedirectFlag();
  });

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    clearLoginRedirectFlag();
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
