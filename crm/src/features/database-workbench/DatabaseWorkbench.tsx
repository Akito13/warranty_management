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
      label: 'Bảng Dữ Liệu',
      icon: '📊',
      badge: '8 Bảng',
      desc: 'Xem dữ liệu thực tế từ 8 bảng cốt lõi được định nghĩa trong init-db.sql',
    },
    {
      id: 'procedures',
      label: 'Thủ Tục Lưu Trữ',
      icon: '⚙️',
      badge: '5 Procedures',
      desc: 'Thực thi các thủ tục lưu trữ nghiệp vụ kèm bảng so sánh Trước & Sau',
    },
    {
      id: 'functions',
      label: 'Hàm Người Dùng',
      icon: '🧮',
      badge: '3 Functions',
      desc: 'Thực thi các hàm vô hướng & hàm bảng: tính toán và tra cứu lịch sử',
    },
    {
      id: 'cursors',
      label: 'Con Trỏ Cursors',
      icon: '🔁',
      badge: '2 Cursors',
      desc: 'Thao tác con trỏ T-SQL: kiểm toán hóa đơn & cảnh báo phiếu bảo hành quá hạn',
    },
    {
      id: 'triggers',
      label: 'Kiểm Thử Trigger',
      icon: '🛡️',
      badge: '7 Triggers',
      desc: 'Kích hoạt sự kiện kiểm thử độc lập: kiểm tra chặn rollback & tự động cập nhật',
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
                  Đồ Án Quản Lý CSDL - UIT
                </span>
                <span className="text-xs text-stone-400 font-mono">MS SQL Server 2022</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-2 text-white">
                Bảng Điều Khiển & Kiểm Thử Nghiệp Vụ CSDL Bảo Hành
              </h1>
              <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-3xl leading-relaxed">
                Giao diện tương tác trực quan để thực thi Thủ Tục Lưu Trữ (Procedures), Hàm Người Dùng (Functions),
                Con Trỏ (Cursors) và kiểm thử Ràng Buộc/Trigger độc lập được định nghĩa trong <code className="text-amber-300 font-mono">init-db.sql</code>.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono bg-stone-800/80 px-3.5 py-2 rounded-xl border border-stone-700 text-stone-300 self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>CSDL: warranty_management</span>
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

