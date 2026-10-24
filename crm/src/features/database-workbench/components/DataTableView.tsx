'use client';

import React from 'react';

interface DataTableViewProps {
  title: string;
  data: any;
  variant?: 'before' | 'after' | 'default' | 'error';
  subtitle?: string;
  badgeText?: string;
  highlightKeys?: string[];
  maxHeight?: string;
  statusNote?: string;
}

export const DataTableView: React.FC<DataTableViewProps> = ({
  title,
  data,
  variant = 'default',
  subtitle,
  badgeText,
  highlightKeys = [],
  maxHeight = 'max-h-96',
  statusNote,
}) => {
  // Chuẩn hóa dữ liệu thành mảng dòng
  let rows: Array<Record<string, any>> = [];

  if (Array.isArray(data)) {
    rows = data.filter((item) => item !== null && typeof item === 'object');
  } else if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    const hasArrayValues = keys.some((k) => Array.isArray(data[k]));

    if (hasArrayValues) {
      return (
        <div className="space-y-4">
          {keys.map((k) => (
            <DataTableView
              key={k}
              title={`${title} (${k})`}
              data={data[k]}
              variant={variant}
              highlightKeys={highlightKeys}
            />
          ))}
        </div>
      );
    } else {
      rows = [data];
    }
  }

  const columns = Array.from(
    new Set(
      rows.flatMap((r) => Object.keys(r)),
    ),
  );

  const getContainerBorder = () => {
    switch (variant) {
      case 'before':
        return 'border-stone-300';
      case 'after':
        return 'border-emerald-300';
      case 'error':
        return 'border-rose-300';
      default:
        return 'border-stone-200';
    }
  };

  const getHeaderBarClasses = () => {
    switch (variant) {
      case 'before':
        return 'bg-stone-900 text-white border-stone-800';
      case 'after':
        return 'bg-emerald-950 text-white border-emerald-900';
      case 'error':
        return 'bg-rose-950 text-white border-rose-900';
      default:
        return 'bg-stone-800 text-white border-stone-700';
    }
  };

  const getBadge = () => {
    if (badgeText) {
      return (
        <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-white text-stone-950 shadow-xs">
          {badgeText}
        </span>
      );
    }

    switch (variant) {
      case 'before':
        return (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-amber-400 text-stone-950 shadow-xs">
            TRƯỚC KHI THỰC HIỆN (Dữ liệu gốc)
          </span>
        );
      case 'after':
        return (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-emerald-400 text-emerald-950 shadow-xs">
            SAU KHI THỰC HIỆN (Dữ liệu mới)
          </span>
        );
      case 'error':
        return (
          <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-rose-400 text-rose-950 shadow-xs">
            BỊ CHẶN BỞI TRIGGER (Đã Rollback)
          </span>
        );
      default:
        return null;
    }
  };

  const getTheadClasses = () => {
    switch (variant) {
      case 'before':
        return 'bg-stone-100 text-stone-900 font-bold border-b border-stone-200';
      case 'after':
        return 'bg-emerald-50 text-emerald-950 font-bold border-b border-emerald-200';
      case 'error':
        return 'bg-rose-50 text-rose-950 font-bold border-b border-rose-200';
      default:
        return 'bg-stone-50 text-stone-900 font-semibold border-b border-stone-200';
    }
  };

  const formatCellValue = (val: any, colName: string) => {
    if (val === null || val === undefined) {
      return <span className="text-stone-400 italic font-mono text-xs">NULL</span>;
    }

    if (typeof val === 'boolean') {
      return (
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
            val ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'
          }`}
        >
          {val ? 'TRUE (1)' : 'FALSE (0)'}
        </span>
      );
    }

    if (colName.toLowerCase().includes('status')) {
      const s = String(val).toLowerCase();
      let color = 'bg-stone-100 text-stone-800';
      if (['paid', 'completed', 'delivered'].includes(s)) color = 'bg-emerald-100 text-emerald-800 font-bold';
      else if (['unpaid', 'repairing', 'inspecting', 'received'].includes(s))
        color = 'bg-sky-100 text-sky-800 font-semibold';
      else if (['waiting_for_parts', 'pending'].includes(s))
        color = 'bg-amber-100 text-amber-800 font-semibold';
      else if (['cancelled'].includes(s)) color = 'bg-rose-100 text-rose-800 font-bold';

      return (
        <span className={`inline-block px-2 py-0.5 rounded-md text-xs uppercase ${color}`}>
          {String(val)}
        </span>
      );
    }

    if (
      colName.toLowerCase().includes('fee') ||
      colName.toLowerCase().includes('amount') ||
      colName.toLowerCase().includes('price') ||
      colName.toLowerCase().includes('cost')
    ) {
      const num = Number(val);
      if (!isNaN(num)) {
        return (
          <span className="font-mono font-bold text-emerald-700">
            ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      }
    }

    if (typeof val === 'string' && val.length > 70) {
      return <span title={val}>{val.substring(0, 70)}...</span>;
    }

    return String(val);
  };

  return (
    <div className={`rounded-xl border shadow-xs overflow-hidden bg-white ${getContainerBorder()}`}>
      {/* Thanh tiêu đề với độ tương phản cao sắc nét */}
      <div className={`px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b ${getHeaderBarClasses()}`}>
        <div className="flex items-center gap-2.5">
          {getBadge()}
          <h4 className="font-bold text-sm tracking-tight text-white">{title}</h4>
        </div>
        {subtitle && <span className="text-xs text-stone-300 font-medium">{subtitle}</span>}
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white/10 text-white">
          {rows.length} {rows.length === 1 ? 'dòng' : 'dòng'}
        </span>
      </div>

      {/* Thông điệp trạng thái nếu có */}
      {statusNote && (
        <div
          className={`px-4 py-2.5 text-xs font-bold border-b flex items-center gap-2 ${
            variant === 'error'
              ? 'bg-rose-50 text-rose-950 border-rose-200'
              : variant === 'after'
              ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
              : 'bg-stone-50 text-stone-900 border-stone-200'
          }`}
        >
          <span>{statusNote}</span>
        </div>
      )}

      {/* Nội dung bảng */}
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-stone-500 bg-white">
          Chưa có dữ liệu hoặc bảng trống.
        </div>
      ) : (
        <div className={`overflow-x-auto ${maxHeight} bg-white`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className={`sticky top-0 ${getTheadClasses()}`}>
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-stone-50 transition-colors ${
                    variant === 'after' ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  {columns.map((col) => {
                    const isHighlighted = highlightKeys.includes(col);
                    return (
                      <td
                        key={col}
                        className={`px-3.5 py-2 whitespace-nowrap text-xs ${
                          isHighlighted ? 'bg-amber-100/70 font-black text-stone-950' : ''
                        }`}
                      >
                        {formatCellValue(row[col], col)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
