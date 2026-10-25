'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { FunctionCatalogItem, FunctionPreviewResult, WorkbenchTableComparison } from '../types';
import { DataTableView } from './DataTableView';

export const FunctionsTab: React.FC = () => {
  const [catalog, setCatalog] = useState<FunctionCatalogItem[]>([]);
  const [selectedFunc, setSelectedFunc] = useState<string>('fn_calculate_parts_total');
  const [sampleData, setSampleData] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [preview, setPreview] = useState<FunctionPreviewResult | null>(null);
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

  const fetchPreview = async (funcId: string, currentData: Record<string, any>) => {
    setLoadingPreview(true);
    try {
      const prev = await workbenchService.getFunctionPreview(funcId, currentData);
      setPreview(prev);
    } catch (err) {
      console.error('Lỗi khi tải preview function', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const initFormForFunc = (funcId: string, samples: any) => {
    setSelectedFunc(funcId);
    setExecutionResult(null);
    setErrorMessage(null);

    let initialData: Record<string, any> = {};

    if (funcId === 'fn_calculate_parts_total') {
      const invId = samples?.invoicesWithParts?.[0]?.id || 18;
      initialData = { invoice_id: invId };
    } else if (funcId === 'fn_is_device_under_warranty') {
      const devId = samples?.devices?.[0]?.id || 1;
      initialData = {
        device_id: devId,
        check_date: new Date().toISOString().split('T')[0],
      };
    } else if (funcId === 'fn_get_device_repair_history') {
      const devId = samples?.devices?.[0]?.id || 1;
      initialData = { device_id: devId };
    }

    setFormData(initialData);
    fetchPreview(funcId, initialData);
  };

  const handleInputChange = (name: string, val: any) => {
    const updated = { ...formData, [name]: val };
    setFormData(updated);
    if (['invoice_id', 'device_id', 'check_date'].includes(name)) {
      fetchPreview(selectedFunc, updated);
    }
  };

  const currentFuncItem = catalog.find((f) => f.id === selectedFunc);

  const handleExecute = async () => {
    setExecuting(true);
    setErrorMessage(null);

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

  const tablesToRender: WorkbenchTableComparison[] =
    executionResult?.tables || preview?.tables || [];

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
              ↺ Tải Dữ Liệu Mẫu Mới
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
                      handleInputChange(
                        param.name,
                        param.type === 'number' ? Number(e.target.value) : e.target.value,
                      )
                    }
                    placeholder={param.description}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-stone-500">{param.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Khối minh bạch câu lệnh SQL thực tế */}
          <div className="space-y-3 rounded-2xl border-2 border-purple-200 bg-purple-50/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔍</span>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-950">
                  Minh Bạch Dữ Liệu & Câu Lệnh SQL Sẽ Thực Thi
                </span>
              </div>
              <span className="text-[11px] text-purple-900 font-bold bg-purple-100 px-2.5 py-0.5 rounded border border-purple-200">
                {preview?.targetDesc || 'Đang nạp thông tin đối tượng hàm...'}
              </span>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-stone-800 bg-stone-950 text-stone-100 p-3.5 shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800 text-[10px] text-stone-400 font-mono">
                <span>T-SQL Function Call (SELECT Expression)</span>
                <span className="text-purple-400 font-bold">SQL Server 2022</span>
              </div>
              <pre className="font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre text-purple-300">
                <code>{executionResult?.exactSql || preview?.exactSql || 'Đang chuẩn bị câu lệnh T-SQL...'}</code>
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <span className="text-xs text-stone-600">
                Nhấn nút bên cạnh để gọi hàm trên SQL Server và quan sát bảng kết quả trả về:
              </span>

              <button
                disabled={executing || loadingPreview}
                onClick={handleExecute}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shrink-0"
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Đang gọi hàm trên SQL Server...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Thực Thi Hàm: {currentFuncItem.sqlName}</span>
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

          {/* Thẻ tóm tắt kết quả vô hướng nếu có */}
          {executionResult && executionResult.result && (
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
              <div>
                <span className="text-xs uppercase font-bold text-purple-700">
                  Kết Quả Tính Toán Từ Hàm Vô Hướng
                </span>
                <div className="text-sm font-semibold text-stone-900 mt-1">
                  {selectedFunc === 'fn_calculate_parts_total' && (
                    <span>
                      Tổng tiền phụ tùng: <strong className="text-emerald-700 font-mono text-lg">${executionResult.result.parts_total.toFixed(2)}</strong>
                    </span>
                  )}
                  {selectedFunc === 'fn_is_device_under_warranty' && (
                    <span>
                      Kết quả kiểm tra bảo hành:{' '}
                      <strong className={executionResult.result.is_under_warranty ? 'text-emerald-700 font-bold' : 'text-stone-600'}>
                        {executionResult.result.is_under_warranty ? '1 (Còn hạn bảo hành hợp lệ)' : '0 (Hết hạn hoặc không có gói bảo hành)'}
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

          {/* KHỐI 2 BẢNG ĐỐI CHIẾU DỮ LIỆU: NGUỒN THAM CHIẾU VÀ KẾT QUẢ TÍNH TỪ HÀM */}
          <div className="space-y-8 pt-4 border-t border-stone-200">
            {/* PHẦN 1: DỮ LIỆU NGUỒN (TRƯỚC KHI THỰC HIỆN) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-200">
                <span className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs"></span>
                  1. Dữ Liệu Nguồn Tham Chiếu Trong Database (TRƯỚC KHI GỌI HÀM)
                </span>
                <span className="text-xs text-stone-600 font-medium">
                  Dữ liệu gốc được lưu trữ trong database mà hàm dùng làm căn cứ tính toán / tra cứu
                </span>
              </div>

              {loadingPreview ? (
                <div className="py-8 text-center text-xs text-stone-500 font-mono animate-pulse">
                  Đang truy vấn dữ liệu gốc từ SQL Server...
                </div>
              ) : tablesToRender.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
                  Chưa có dữ liệu bảng liên quan.
                </div>
              ) : (
                <div className="space-y-4">
                  {tablesToRender.map((tbl, idx) => (
                    <DataTableView
                      key={`${tbl.tableName}-before-${idx}`}
                      title={tbl.tableTitle}
                      subtitle={tbl.description}
                      data={tbl.beforeRows}
                      variant="before"
                      highlightKeys={tbl.highlightColumns}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* PHẦN 2: DỮ LIỆU THỰC TẾ TRẢ VỀ TỪ HÀM (SAU KHI THỰC HIỆN) */}
            {executionResult && (
              <div className="space-y-4 pt-4 border-t border-stone-200 animate-in fade-in">
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border bg-purple-50 border-purple-200 text-purple-950">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shadow-xs"></span>
                    2. Kết Quả Tính Toán / Bảng Trả Về Từ Hàm (SAU KHI THỰC HIỆN)
                  </span>
                  <span className="text-xs font-bold text-purple-900">
                    ✓ Xác nhận kết quả hàm: Tính toán hoàn tất trực tiếp từ SQL Server
                  </span>
                </div>

                <div className="space-y-4">
                  {tablesToRender.map((tbl, idx) => (
                    <DataTableView
                      key={`${tbl.tableName}-after-${idx}`}
                      title={tbl.tableTitle}
                      subtitle={tbl.description}
                      data={tbl.afterRows || tbl.beforeRows}
                      variant="after"
                      badgeText="KẾT QUẢ TÍNH TỪ HÀM"
                      statusNote={tbl.statusNote}
                      highlightKeys={tbl.highlightColumns}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
