'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { FunctionCatalogItem } from '../types';
import { DataTableView } from './DataTableView';

export const FunctionsTab: React.FC = () => {
  const [catalog, setCatalog] = useState<FunctionCatalogItem[]>([]);
  const [selectedFunc, setSelectedFunc] = useState<string>('fn_calculate_parts_total');
  const [sampleData, setSampleData] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCatalogAndSamples();
  }, []);

  const loadCatalogAndSamples = async () => {
    try {
      const [cat, samples] = await Promise.all([
        workbenchService.getFunctionsCatalog(),
        workbenchService.getFunctionSampleData(),
      ]);
      setCatalog(cat);
      setSampleData(samples);
      if (cat.length > 0) {
        initFormForFunc(cat[0].id, samples);
      }
    } catch (err) {
      console.error('Failed to load functions catalog', err);
    }
  };

  const initFormForFunc = (funcId: string, samples: any) => {
    setSelectedFunc(funcId);
    setExecutionResult(null);
    setErrorMessage(null);

    if (funcId === 'fn_calculate_parts_total') {
      const invId = samples?.invoicesWithParts?.[0]?.id || 1;
      setFormData({ invoice_id: invId });
    } else if (funcId === 'fn_is_device_under_warranty') {
      const devId = samples?.devices?.[0]?.id || 1;
      setFormData({
        device_id: devId,
        check_date: new Date().toISOString().split('T')[0],
      });
    } else if (funcId === 'fn_get_device_repair_history') {
      const devId = samples?.devices?.[0]?.id || 1;
      setFormData({ device_id: devId });
    }
  };

  const currentFuncItem = catalog.find((f) => f.id === selectedFunc);

  const handleExecute = async () => {
    setExecuting(true);
    setErrorMessage(null);
    setExecutionResult(null);

    try {
      let res: any;
      if (selectedFunc === 'fn_calculate_parts_total') {
        res = await workbenchService.executeCalculatePartsTotal(formData);
      } else if (selectedFunc === 'fn_is_device_under_warranty') {
        res = await workbenchService.executeIsDeviceUnderWarranty(formData);
      } else if (selectedFunc === 'fn_get_device_repair_history') {
        res = await workbenchService.executeDeviceRepairHistory(formData);
      }
      setExecutionResult(res);
    } catch (err: any) {
      console.error('Function execution error', err);
      setErrorMessage(err.message || 'Execution error encountered');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Function selection pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {catalog.map((fn) => {
          const isSelected = fn.id === selectedFunc;
          return (
            <button
              key={fn.id}
              onClick={() => initFormForFunc(fn.id, sampleData)}
              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600'
                  : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                  {fn.type}
                </span>
                <span className="text-[10px] font-mono text-stone-500 font-semibold">
                  Returns: {fn.returnType}
                </span>
              </div>
              <div className="font-bold text-xs text-stone-900 mt-2">{fn.name}</div>
              <div className="text-[11px] font-mono text-stone-500 mt-0.5">{fn.sqlName}</div>
            </button>
          );
        })}
      </div>

      {/* Main Execution Workbench */}
      {currentFuncItem && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-stone-900">{currentFuncItem.name}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                  {currentFuncItem.sqlName}
                </span>
              </div>
              <p className="text-xs text-stone-600 mt-1">{currentFuncItem.description}</p>
            </div>

            <button
              type="button"
              onClick={() => initFormForFunc(selectedFunc, sampleData)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 cursor-pointer text-stone-700 self-start sm:self-auto"
            >
              ↻ Reset / Load Sample
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Input Parameters
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {currentFuncItem.parameters.map((param) => (
                <div key={param.name} className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                    <span>
                      @{param.name} {param.required && <span className="text-rose-500">*</span>}
                    </span>
                    <span className="text-[10px] text-stone-400 font-normal">({param.type})</span>
                  </label>

                  <input
                    type={param.type === 'number' ? 'number' : param.type === 'date' ? 'date' : 'text'}
                    value={formData[param.name] ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [param.name]: param.type === 'number' ? Number(e.target.value) : e.target.value,
                      }))
                    }
                    placeholder={param.description}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-stone-500">{param.description}</p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                disabled={executing}
                onClick={handleExecute}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Calling Function on MSSQL...</span>
                  </>
                ) : (
                  <>
                    <span>🧮 Call Function: {currentFuncItem.sqlName}</span>
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

          {/* Results Comparison */}
          {executionResult && (
            <div className="space-y-6 pt-4 border-t border-stone-100">
              {/* Scalar summary card if scalar function */}
              {executionResult.result && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold text-purple-700">
                      Function Evaluation Output
                    </span>
                    <div className="text-sm font-semibold text-stone-900 mt-0.5">
                      {selectedFunc === 'fn_calculate_parts_total' && (
                        <span>
                          Parts Total: <strong className="text-emerald-700 font-mono text-lg">${executionResult.result.parts_total.toFixed(2)}</strong>
                        </span>
                      )}
                      {selectedFunc === 'fn_is_device_under_warranty' && (
                        <span>
                          Warranty Evaluation: {' '}
                          <strong className={executionResult.result.is_under_warranty ? 'text-emerald-700 font-bold' : 'text-stone-500'}>
                            {executionResult.result.is_under_warranty ? '1 (Under Active Warranty)' : '0 (Expired / Not Covered)'}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-purple-800 bg-purple-200/70 px-2.5 py-1 rounded-lg">
                    {currentFuncItem.sqlName}()
                  </span>
                </div>
              )}

              {/* Table 1: BEFORE Table */}
              <div className="space-y-2">
                <DataTableView
                  title="Source Entity / Data (BEFORE Evaluation)"
                  data={executionResult.before}
                  variant="before"
                  subtitle="Original data in database referenced by the function evaluation"
                />
              </div>

              {/* Table 2: AFTER Table / Result dataset */}
              <div className="space-y-2">
                <DataTableView
                  title="Function Output / Result Dataset (AFTER Evaluation)"
                  data={executionResult.after}
                  variant="after"
                  subtitle="Computed results or inline table rows returned by the function"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

