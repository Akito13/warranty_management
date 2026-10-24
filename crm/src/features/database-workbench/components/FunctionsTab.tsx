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
      console.error('Lỗi khi tải danh mục hàm', err);
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
      console.error('Lỗi khi gọi hàm', err);
      setErrorMessage(err.message || 'Lỗi thực thi hàm người dùng');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Danh sách 3 hàm */}
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
                  {fn.type === 'scalar' ? 'Hàm Vô Hướng (Scalar)' : 'Hàm Dạng Bảng (Table-Valued)'}
                </span>
                <span className="text-[10px] font-mono text-stone-500 font-semibold">
                  Trả về: {fn.returnType}
                </span>
              </div>
              <div className="font-bold text-xs text-stone-900 mt-2 leading-snug">{fn.name}</div>
              <div className="text-[11px] font-mono text-stone-500 mt-0.5">{fn.sqlName}</div>
            </button>
          );
        })}
      </div>

      {/* Bảng làm việc chính */}
      {currentFuncItem && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-stone-900">{currentFuncItem.name}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-bold">
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
              ↻ Tải Dữ Liệu Mẫu Mới
            </button>
          </div>

          {/* Form tham số */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Tham Số Đầu Vào (Input Parameters)
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
                    <span>Đang gọi hàm trên SQL Server...</span>
                  </>
                ) : (
                  <>
                    <span>🧮 Thực Thi Hàm: {currentFuncItem.sqlName}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lỗi nếu có */}
          {errorMessage && (
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-semibold">
              <span className="font-bold">Lỗi:</span> {errorMessage}
            </div>
          )}

          {/* Kết quả đối chiếu */}
          {executionResult && (
            <div className="space-y-6 pt-4 border-t border-stone-100">
              {/* Thẻ tóm tắt kết quả vô hướng nếu có */}
              {executionResult.result && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs uppercase font-bold text-purple-700">
                      Kết Quả Tính Toán Từ Hàm Vô Hướng
                    </span>
                    <div className="text-sm font-semibold text-stone-900 mt-1">
                      {selectedFunc === 'fn_calculate_parts_total' && (
                        <span>
                          Tổng tiền linh kiện: <strong className="text-emerald-700 font-mono text-lg">${executionResult.result.parts_total.toFixed(2)}</strong>
                        </span>
                      )}
                      {selectedFunc === 'fn_is_device_under_warranty' && (
                        <span>
                          Kết quả kiểm tra bảo hành:{' '}
                          <strong className={executionResult.result.is_under_warranty ? 'text-emerald-700 font-bold' : 'text-stone-500'}>
                            {executionResult.result.is_under_warranty ? '1 (Còn trong thời hạn bảo hành)' : '0 (Đã hết hạn hoặc không có bảo hành)'}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-purple-800 bg-purple-200/70 px-2.5 py-1 rounded-lg font-bold">
                    SELECT {currentFuncItem.sqlName}()
                  </span>
                </div>
              )}

              {/* Bảng TRƯỚC */}
              <div className="space-y-2">
                <DataTableView
                  title="Dữ liệu nguồn tham chiếu (TRƯỚC KHI GỌI HÀM)"
                  data={executionResult.before}
                  variant="before"
                  subtitle="Dữ liệu gốc trong database được hàm sử dụng để tính toán"
                />
              </div>

              {/* Bảng SAU */}
              <div className="space-y-2">
                <DataTableView
                  title="Kết quả trả về từ hàm (SAU KHI THỰC THI)"
                  data={executionResult.after}
                  variant="after"
                  subtitle="Dữ liệu tính toán vô hướng hoặc bảng bản ghi được hàm trả về"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
