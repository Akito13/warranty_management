'use client';

import React from 'react';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: any[];
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  return <>{children}</>;
};
