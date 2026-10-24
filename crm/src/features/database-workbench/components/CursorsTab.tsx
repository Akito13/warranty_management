'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { CursorCatalogItem } from '../types';
import { DataTableView } from './DataTableView';

export const CursorsTab: React.FC = () => {
  const [catalog, setCatalog] = useState<CursorCatalogItem[]>([]);
  const [selectedCursor, setSelectedCursor] = useState<string>('sp_audit_invoices');
  const [autoFix, setAutoFix] = useState<boolean>(false);
  const [delayDays, setDelayDays] = useState<number>(7);
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const list = await workbenchService.getCursorsCatalog();
      setCatalog(list);
      if (list.length > 0) {
        setSelectedCursor(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load cursors catalog', err);
    }
  };

  const currentCursorItem = catalog.find((c) => c.id === selectedCursor);

  const handleExecute = async () => {
    setExecuting(true);
    setErrorMessage(null);
    setExecutionResult(null);

    try {
      let res: any;
      if (selectedCursor === 'sp_audit_invoices') {
        res = await workbenchService.executeAuditInvoices({ auto_fix: autoFix });
      } else {
        res = await workbenchService.executeDelayedTickets({ delay_days: delayDays });
      }
      setExecutionResult(res);
    } catch (err: any) {
      console.error('Cursor execution error', err);
      setErrorMessage(err.message || 'Error executing cursor routine');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cursor selection cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {catalog.map((cur) => {
          const isSelected = cur.id === selectedCursor;
          return (
            <button
              key={cur.id}
              onClick={() => {
                setSelectedCursor(cur.id);
                setExecutionResult(null);
                setErrorMessage(null);
              }}
              className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600'
                  : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded">
                  {cur.cursorType}
                </span>
                <span className="text-xs font-mono text-stone-500 font-bold">{cur.sqlName}</span>
              </div>
              <div className="font-bold text-sm text-stone-900 mt-2">{cur.name}</div>
              <div className="text-xs font-mono text-indigo-700 mt-1">Cursor: {cur.cursorName}</div>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">{cur.description}</p>
            </button>
          );
        })}
      </div>

      {/* Main Execution Workbench */}
      {currentCursorItem && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="pb-4 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-stone-900">{currentCursorItem.name}</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800">
                {currentCursorItem.cursorName}
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1">{currentCursorItem.description}</p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Cursor Execution Options
            </h4>

            {selectedCursor === 'sp_audit_invoices' ? (
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-stone-900">
                    Enable Auto-Fix Reconciliation (@auto_fix = 1)
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    When enabled, any invoice where stored total_amount does not match (labor + parts -
                    discount) will be automatically updated by the cursor.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFix}
                    onChange={(e) => setAutoFix(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            ) : (
              <div className="max-w-xs space-y-1">
                <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                  <span>@delay_days (Overdue Threshold)</span>
                  <span className="font-mono font-bold text-indigo-700">{delayDays} days</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden font-mono"
                />
                <p className="text-[10px] text-stone-500">
                  Find active tickets received more than {delayDays} days ago without completion.
                </p>
              </div>
            )}

            <div className="pt-2">
              <button
                disabled={executing}
                onClick={handleExecute}
                className="px-5 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Iterating Cursor on MSSQL...</span>
                  </>
                ) : (
                  <>
                    <span>🔁 Iterate Cursor: {currentCursorItem.sqlName}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-semibold">
              <span className="font-bold">Error:</span> {errorMessage}
            </div>
          )}

          {/* Results: BEFORE & AFTER Comparison */}
          {executionResult && (
            <div className="space-y-6 pt-4 border-t border-stone-100">
              {/* Summary banner */}
              <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-bold text-cyan-800">
                    Cursor Execution Summary
                  </span>
                  <div className="text-sm font-semibold text-stone-900 mt-0.5">
                    {selectedCursor === 'sp_audit_invoices' ? (
                      <span>
                        Discrepancies Detected:{' '}
                        <strong className="text-indigo-700 font-mono text-base">
                          {executionResult.result?.discrepancies_found ?? 0}
                        </strong>{' '}
                        | Auto-Fixed:{' '}
                        <strong className="text-emerald-700">
                          {executionResult.result?.was_auto_fixed ? 'YES (Committed)' : 'NO (Audit Only)'}
                        </strong>
                      </span>
                    ) : (
                      <span>
                        Overdue Delayed Tickets Found by Cursor:{' '}
                        <strong className="text-rose-700 font-mono text-base">
                          {executionResult.totalOverdueFound ?? 0}
                        </strong>{' '}
                        (threshold &gt; {executionResult.delayDays} days)
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs font-mono text-cyan-900 bg-cyan-200/70 px-2.5 py-1 rounded-lg">
                  {executionResult.cursorUsed}
                </span>
              </div>

              {/* Table 1: BEFORE Table */}
              <div className="space-y-2">
                <DataTableView
                  title={
                    selectedCursor === 'sp_audit_invoices'
                      ? 'Invoices Stored Totals (BEFORE Cursor Iteration)'
                      : 'All Active Tickets (BEFORE Cursor Filtering)'
                  }
                  data={executionResult.before}
                  variant="before"
                  subtitle="Dataset prior to executing cursor row-by-row iteration"
                />
              </div>

              {/* Table 2: AFTER Table */}
              <div className="space-y-2">
                <DataTableView
                  title={
                    selectedCursor === 'sp_audit_invoices'
                      ? 'Invoices Reconciliation State (AFTER Cursor Audit)'
                      : 'Overdue Tickets Dataset (FETCHED BY CURSOR)'
                  }
                  data={executionResult.after}
                  variant="after"
                  subtitle="Results produced or updated by the T-SQL cursor loop"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

