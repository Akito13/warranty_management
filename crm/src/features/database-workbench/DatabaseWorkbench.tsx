'use client';

import React, { useState } from 'react';
import { TablesTab } from './components/TablesTab';
import { ProceduresTab } from './components/ProceduresTab';
import { FunctionsTab } from './components/FunctionsTab';
import { CursorsTab } from './components/CursorsTab';
import { TriggersTab } from './components/TriggersTab';

export type WorkbenchTab = 'tables' | 'procedures' | 'functions' | 'cursors' | 'triggers';

export const DatabaseWorkbench: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('tables');

  const tabs: Array<{ id: WorkbenchTab; label: string; icon: string; badge?: string; desc: string }> = [
    {
      id: 'tables',
      label: 'Database Tables',
      icon: '📊',
      badge: '8 Tables',
      desc: 'Live browser for all 8 core tables defined in init-db.sql',
    },
    {
      id: 'procedures',
      label: 'Stored Procedures',
      icon: '⚙️',
      badge: '5 Procedures',
      desc: 'Business-related stored procedures with Before & After execution diff',
    },
    {
      id: 'functions',
      label: 'User Functions',
      icon: '🧮',
      badge: '3 Functions',
      desc: 'Scalar & table-valued functions calculation & history evaluation',
    },
    {
      id: 'cursors',
      label: 'Cursors',
      icon: '🔁',
      badge: '2 Cursors',
      desc: 'T-SQL cursor operations: invoice auditing & overdue ticket alerting',
    },
    {
      id: 'triggers',
      label: 'Triggers Enforcement',
      icon: '🛡️',
      badge: '7 Triggers',
      desc: 'Independent trigger event testing: validation rollback & auto-update diff',
    },
  ];

  return (
    <div className="min-h-screen bg-stone-100/60 pb-16">
      {/* Hero Header */}
      <div className="bg-stone-900 text-white border-b border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-400 text-stone-950">
                  UIT Database Management Project
                </span>
                <span className="text-xs text-stone-400 font-mono">MS SQL Server 2022</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-2 text-white">
                Warranty & Repair Database Operations Workbench
              </h1>
              <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-3xl leading-relaxed">
                Direct interactive control surface for executing Stored Procedures, User-Defined Functions,
                T-SQL Cursors, and validating Database Triggers defined in <code className="text-amber-300 font-mono">init-db.sql</code>.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono bg-stone-800/80 px-3.5 py-2 rounded-xl border border-stone-700 text-stone-300 self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>DB: warranty_management</span>
            </div>
          </div>

          {/* Navigation Bar Pills */}
          <div className="flex items-center gap-2 mt-8 overflow-x-auto pb-2 scrollbar-none">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-400 text-stone-950 shadow-sm shadow-amber-400/20'
                      : 'bg-stone-800/90 text-stone-300 hover:bg-stone-800 hover:text-white'
                  }`}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        isActive
                          ? 'bg-stone-950/20 text-stone-900 font-bold'
                          : 'bg-stone-700 text-stone-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {activeTab === 'tables' && <TablesTab />}
        {activeTab === 'procedures' && <ProceduresTab />}
        {activeTab === 'functions' && <FunctionsTab />}
        {activeTab === 'cursors' && <CursorsTab />}
        {activeTab === 'triggers' && <TriggersTab />}
      </main>
    </div>
  );
};

