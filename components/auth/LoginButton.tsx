'use client';

import { forwardRef } from 'react';
import { useLoginModal } from './LoginModalContext';

type LoginButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

const LoginButton = forwardRef<HTMLButtonElement, LoginButtonProps>(
  ({ children, onClick, type = 'button', ...props }, ref) => {
    const { openModal } = useLoginModal();

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) {
            return;
          }
          openModal();
        }}
      >
        {children}
      </button>
    );
  },
);

LoginButton.displayName = 'LoginButton';

export default LoginButton;
