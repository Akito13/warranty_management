'use client';

import React from 'react';
import { QueryProvider } from '@/lib/query-provider';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <QueryProvider>
      <div className="min-h-screen bg-stone-100/60 flex flex-col font-sans">
        <main className="flex-1 w-full">{children}</main>
      </div>
    </QueryProvider>
  );
};
