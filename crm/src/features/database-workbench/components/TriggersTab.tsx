'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { TriggerCatalogItem, TriggerExecutionResult } from '../types';
import { DataTableView } from './DataTableView';

export const TriggersTab: React.FC = () => {
  const [catalog, setCatalog] = useState<TriggerCatalogItem[]>([]);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string>('trg_invoice_items_stock');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('stock_exceeded_fail');
  const [sampleData, setSampleData] = useState<any>(null);
  const [initialBeforeData, setInitialBeforeData] = useState<any>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<TriggerExecutionResult | null>(null);

  useEffect(() => {
    loadCatalogAndSamples();
  }, []);

  const loadCatalogAndSamples = async () => {
    try {
      const [cat, samples] = await Promise.all([
        workbenchService.getTriggersCatalog(),
        workbenchService.getTriggerSampleData(),
      ]);
      setCatalog(cat);
      setSampleData(samples);
      if (cat.length > 0) {
        setSelectedTriggerId(cat[0].id);
        setSelectedScenarioId(cat[0].scenarios[0].id);
        loadInitialBefore(cat[0].id, samples);
      }
    } catch (err) {
      console.error('Failed to load triggers catalog', err);
    }
  };

  const handleSelectTrigger = (triggerId: string) => {
    setSelectedTriggerId(triggerId);
    setResult(null);
    const trig = catalog.find((t) => t.id === triggerId);
    if (trig && trig.scenarios.length > 0) {
      setSelectedScenarioId(trig.scenarios[0].id);
    }
    loadInitialBefore(triggerId, sampleData);
  };

  const loadInitialBefore = async (triggerId: string, samples: any) => {
    setLoadingInitial(true);
    setResult(null);

    try {
      // Fetch relevant "before" data based on trigger type so the user can immediately see the original data
      if (triggerId === 'trg_invoice_items_stock') {
        const parts = await workbenchService.getTableData('parts', 1, 5);
        setInitialBeforeData(parts.items);
      } else if (triggerId === 'trg_invoices_total_amount' || triggerId === 'trg_invoices_labor_update') {
        const invoices = await workbenchService.getTableData('invoices', 1, 5);
        setInitialBeforeData(invoices.items);
      } else if (triggerId === 'trg_tickets_workflow_guard') {
        const tickets = await workbenchService.getTableData('tickets', 1, 5);
        setInitialBeforeData(tickets.items);
      } else if (triggerId === 'trg_tickets_audit_history') {
        const history = await workbenchService.getTableData('ticket_status_history', 1, 5);
        setInitialBeforeData(history.items);
      } else if (triggerId === 'trg_invoice_items_freeze_paid' || triggerId === 'trg_invoices_freeze_paid_amounts') {
        const invoices = await workbenchService.getTableData('invoices', 1, 5, 'paid');
        setInitialBeforeData(invoices.items);
      }
    } catch (err) {
      console.error('Failed to load initial before data', err);
    } finally {
      setLoadingInitial(false);
    }
  };

  const currentTrigger = catalog.find((t) => t.id === selectedTriggerId);
  const currentScenario = currentTrigger?.scenarios.find((s) => s.id === selectedScenarioId);

  const handleRunTriggerEvent = async () => {
    setExecuting(true);
    setResult(null);

    try {
      const res = await workbenchService.executeTriggerTest({
        trigger_id: selectedTriggerId,
        scenario_id: selectedScenarioId,
        params: {},
      });
      setResult(res);
    } catch (err: any) {
      console.error('Trigger test error', err);
      setResult({
        success: false,
        stopped: true,
        triggerName: selectedTriggerId,
        reason: err.message || 'Trigger stopped execution with transaction rollback.',
        message: `${selectedTriggerId} stopped this action due to: ${err.message || 'database exception'}`,
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Trigger selection tabs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-stone-900">
            Database Triggers (Independent Enforcement Events)
          </h3>
          <span className="text-xs text-stone-500 font-mono">
            {catalog.length} operational triggers loaded from init-db.sql
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {catalog.map((trig) => {
            const isSelected = trig.id === selectedTriggerId;
            return (
              <button
                key={trig.id}
                onClick={() => handleSelectTrigger(trig.id)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'border-rose-600 bg-rose-50/70 shadow-xs ring-1 ring-rose-600'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      trig.type === 'guard'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : trig.type === 'cascade'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}
                  >
                    {trig.type}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">ON {trig.table}</span>
                </div>
                <div className="font-bold text-xs font-mono text-stone-900 mt-2 truncate">
                  {trig.name}
                </div>
                <div className="text-[10px] text-stone-500 mt-1 line-clamp-1">{trig.timing}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Main Trigger Testing Workbench */}
      {currentTrigger && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header & Trigger Info */}
          <div className="pb-4 border-b border-stone-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-extrabold font-mono text-stone-900">
                  {currentTrigger.name}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase bg-stone-100 text-stone-700">
                  ON [{currentTrigger.table}] {currentTrigger.timing}
                </span>
              </div>
              <span className="text-xs font-mono text-stone-500">
                Trigger Action Type: {currentTrigger.type.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
              {currentTrigger.description}
            </p>
          </div>

          {/* Scenarios selector */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Select Trigger Test Event:
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentTrigger.scenarios.map((scen) => {
                const isSelected = scen.id === selectedScenarioId;
                const isStop = scen.expectedOutcome === 'STOPPED';

                return (
                  <button
                    key={scen.id}
                    onClick={() => {
                      setSelectedScenarioId(scen.id);
                      setResult(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? isStop
                          ? 'border-rose-600 bg-rose-50/70 ring-1 ring-rose-600'
                          : 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                        : 'border-stone-200 bg-stone-50/50 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          isStop
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {isStop ? '🛑 Expected: Trigger STOPS' : '🟢 Expected: Trigger MODIFIES'}
                      </span>
                    </div>

                    <div className="font-bold text-xs text-stone-900 mt-2">{scen.title}</div>
                    <p className="text-[11px] text-stone-600 mt-1">{scen.description}</p>
                    <div className="text-[10px] font-mono text-stone-500 mt-2 bg-white/70 p-1.5 rounded border border-stone-200">
                      SQL: {scen.actionDescription}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trigger Action Launch Button */}
          {currentScenario && (
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-stone-900">
                  Ready to fire database event:
                </div>
                <div className="text-xs font-mono text-indigo-700 mt-0.5">
                  {currentScenario.actionDescription}
                </div>
              </div>

              <button
                disabled={executing}
                onClick={handleRunTriggerEvent}
                className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all ${
                  currentScenario.expectedOutcome === 'STOPPED'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Triggering Database Action...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {currentScenario.expectedOutcome === 'STOPPED'
                        ? '🛑 Trigger Event (Should Stop & Rollback)'
                        : '🟢 Trigger Event (Should Auto-Update)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* PROMINENT TRIGGER STOP ERROR BANNER */}
          {result && result.stopped && (
            <div className="p-5 rounded-2xl border-2 border-rose-500 bg-rose-50/90 shadow-sm text-rose-950 space-y-2">
              <div className="flex items-center gap-2 font-extrabold text-sm text-rose-800">
                <span className="text-lg">⛔</span>
                <span>Trigger Verification Confirmed: Action Blocked & Rolled Back</span>
              </div>
              <div className="p-3 bg-white/80 rounded-xl border border-rose-200 font-mono text-xs font-bold text-rose-900">
                {result.triggerName} stopped this action due to: {result.reason}
              </div>
              <p className="text-[11px] text-rose-700">
                The database trigger fired, detected the illegal operation, raised an exception, and
                executed ROLLBACK TRANSACTION. Integrity of table data was preserved!
              </p>
            </div>
          )}

          {/* TRIGGER SUCCESS UPDATE BANNER */}
          {result && !result.stopped && (
            <div className="p-4 rounded-xl border border-emerald-400 bg-emerald-50 text-emerald-950 space-y-1">
              <div className="flex items-center gap-2 font-bold text-xs text-emerald-800">
                <span>✓</span>
                <span>Trigger Execution Succeeded: Automatic Database Changes Applied</span>
              </div>
              <p className="text-xs text-emerald-900 font-mono">{result.message}</p>
            </div>
          )}

          {/* LIVE TABLES COMPARISON: BEFORE & AFTER */}
          <div className="space-y-6 pt-4 border-t border-stone-200">
            {/* Table 1: BEFORE Table (Always visible right away so user sees original related data!) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  1. Original Related Data (BEFORE Action)
                </span>
                <span className="text-[11px] text-stone-500">
                  Live state of table [{currentTrigger.table}] prior to event
                </span>
              </div>
              <DataTableView
                title={`Table: ${currentTrigger.table} (BEFORE)`}
                data={result?.before || initialBeforeData || []}
                variant="before"
                subtitle="Baseline records before trigger invocation"
              />
            </div>

            {/* Table 2: AFTER Table (Only if trigger modified data) */}
            {result && !result.stopped && result.after && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    2. Modified Related Data (AFTER Trigger Execution)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold">
                    ✓ Updated automatically by trigger
                  </span>
                </div>
                <DataTableView
                  title={`Table: ${currentTrigger.table} (AFTER TRIGGER CHANGES)`}
                  data={result.after}
                  variant="after"
                  subtitle="New state reflecting automated trigger calculations / timestamps / audit logs"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

