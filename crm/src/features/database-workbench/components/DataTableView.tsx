'use client';

import React from 'react';

interface DataTableViewProps {
  title: string;
  data: any;
  variant?: 'before' | 'after' | 'default' | 'error';
  subtitle?: string;
  highlightKeys?: string[];
  maxHeight?: string;
}

export const DataTableView: React.FC<DataTableViewProps> = ({
  title,
  data,
  variant = 'default',
  subtitle,
  highlightKeys = [],
  maxHeight = 'max-h-96',
}) => {
  // Normalize data into array of rows
  let rows: Array<Record<string, any>> = [];

  if (Array.isArray(data)) {
    rows = data.filter((item) => item !== null && typeof item === 'object');
  } else if (data && typeof data === 'object') {
    // If it's an object with nested arrays, e.g. { device: [...], tickets: [...] }
    const keys = Object.keys(data);
    const hasArrayValues = keys.some((k) => Array.isArray(data[k]));

    if (hasArrayValues) {
      // Render multiple sub-tables if nested
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

  // Derive column headers
  const columns = Array.from(
    new Set(
      rows.flatMap((r) => Object.keys(r)),
    ),
  );

  // Styling based on variant
  const getHeaderStyle = () => {
    switch (variant) {
      case 'before':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300';
      case 'after':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300';
      case 'error':
        return 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300';
      default:
        return 'bg-slate-100 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200';
    }
  };

  const getBadge = () => {
    switch (variant) {
      case 'before':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
            BEFORE (Original Data)
          </span>
        );
      case 'after':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
            AFTER (Updated Data)
          </span>
        );
      case 'error':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
            STOPPED BY TRIGGER
          </span>
        );
      default:
        return null;
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
      if (['paid', 'completed', 'delivered'].includes(s)) color = 'bg-emerald-100 text-emerald-800';
      else if (['unpaid', 'repairing', 'inspecting', 'received'].includes(s))
        color = 'bg-sky-100 text-sky-800';
      else if (['waiting_for_parts', 'pending'].includes(s))
        color = 'bg-amber-100 text-amber-800';
      else if (['cancelled'].includes(s)) color = 'bg-rose-100 text-rose-800';

      return (
        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold uppercase ${color}`}>
          {String(val)}
        </span>
      );
    }

    if (colName.toLowerCase().includes('fee') || colName.toLowerCase().includes('amount') || colName.toLowerCase().includes('price') || colName.toLowerCase().includes('cost')) {
      const num = Number(val);
      if (!isNaN(num)) {
        return (
          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
            ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      }
    }

    if (typeof val === 'string' && val.length > 60) {
      return <span title={val}>{val.substring(0, 60)}...</span>;
    }

    return String(val);
  };

  return (
    <div className={`rounded-xl border shadow-xs overflow-hidden ${getHeaderStyle()}`}>
      {/* Header bar */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-inherit">
        <div className="flex items-center gap-3">
          {getBadge()}
          <h4 className="font-bold text-sm tracking-tight">{title}</h4>
        </div>
        {subtitle && <span className="text-xs opacity-75">{subtitle}</span>}
        <span className="text-xs font-mono opacity-80 font-medium">
          {rows.length} {rows.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {/* Table view */}
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-stone-500 bg-white dark:bg-stone-900">
          No records found.
        </div>
      ) : (
        <div className={`overflow-x-auto ${maxHeight} bg-white dark:bg-stone-900`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold border-b border-stone-200 dark:border-stone-700">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-3.5 py-2.5 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-800 dark:text-stone-200">
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className={`hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors ${
                    variant === 'after' ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  {columns.map((col) => {
                    const isHighlighted = highlightKeys.includes(col);
                    return (
                      <td
                        key={col}
                        className={`px-3.5 py-2 whitespace-nowrap text-xs ${
                          isHighlighted ? 'bg-amber-100/50 font-bold' : ''
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

