'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { ProcedureCatalogItem, ProcedurePreviewResult, WorkbenchTableComparison } from '../types';
import { DataTableView } from './DataTableView';

export const ProceduresTab: React.FC = () => {
  const [catalog, setCatalog] = useState<ProcedureCatalogItem[]>([]);
  const [selectedProc, setSelectedProc] = useState<string>('sp_receive_device');
  const [sampleData, setSampleData] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [preview, setPreview] = useState<ProcedurePreviewResult | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCatalogAndSamples();
  }, []);

  const loadCatalogAndSamples = async () => {
    try {
      const [cat, samples] = await Promise.all([
        workbenchService.getProceduresCatalog(),
        workbenchService.getProcedureSampleData(),
      ]);
      setCatalog(cat);
      setSampleData(samples);
      if (cat.length > 0) {
        initFormForProc(cat[0].id, samples);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh mục stored procedure', err);
    }
  };

  const fetchPreview = async (procId: string, currentData: Record<string, any>) => {
    setLoadingPreview(true);
    try {
      const prev = await workbenchService.getProcedurePreview(procId, currentData);
      setPreview(prev);
    } catch (err) {
      console.error('Lỗi khi tải preview procedure', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const initFormForProc = (procId: string, samples: any) => {
    setSelectedProc(procId);
    setExecutionResult(null);
    setErrorMessage(null);

    let initialData: Record<string, any> = {};

    if (procId === 'sp_receive_device') {
      const devId = samples?.devices?.[0]?.id || 1;
      const recId = samples?.receptionists?.[0]?.id || 1;
      initialData = {
        device_id: devId,
        receptionist_id: recId,
        issue_description: 'Màn hình chớp nháy và thiết bị nóng nhanh khi chạy tác vụ nặng',
        initial_condition: 'Trầy nhẹ nắp lưng, màn hình và bàn phím còn nguyên vẹn',
        accessories: 'Củ sạc zin 65W, Cáp Type-C, Túi chống sốc',
        ticket_type: 'repair',
      };
    } else if (procId === 'sp_process_ticket') {
      const tickId = samples?.tickets?.[0]?.id || 1;
      const techId = samples?.technicians?.[0]?.id || 1;
      initialData = {
        ticket_id: tickId,
        status: 'repairing',
        technician_id: techId,
        fault_cause: 'Tụ lọc nguồn CPU bị phù và keo tản nhiệt bị khô cứng',
        repair_solution: 'Thay thế tụ lọc nguồn và tra lại keo tản nhiệt gốm cao cấp',
        estimated_cost: 150,
      };
    } else if (procId === 'sp_create_invoice') {
      const tickId = samples?.completedTickets?.[0]?.ticket_id || samples?.tickets?.[0]?.id || 1;
      initialData = {
        ticket_id: tickId,
        labor_fee: 120,
      };
    } else if (procId === 'sp_add_invoice_part') {
      const invId = samples?.unpaidInvoices?.[0]?.id || 1;
      const partId = samples?.parts?.[0]?.id || 1;
      initialData = {
        invoice_id: invId,
        part_id: partId,
        quantity: 1,
      };
    } else if (procId === 'sp_checkout_invoice') {
      const invId = samples?.completedTickets?.[0]?.invoice_id || samples?.unpaidInvoices?.[0]?.id || 1;
      initialData = {
        invoice_id: invId,
        payment_method: 'cash',
      };
    }

    setFormData(initialData);
    fetchPreview(procId, initialData);
  };

  const handleInputChange = (name: string, val: any) => {
    const updated = { ...formData, [name]: val };
    setFormData(updated);
    if (['device_id', 'ticket_id', 'invoice_id', 'part_id', 'status', 'labor_fee', 'quantity', 'payment_method'].includes(name)) {
      fetchPreview(selectedProc, updated);
    }
  };

  const currentProcItem = catalog.find((p) => p.id === selectedProc);

  const handleExecute = async () => {
    setExecuting(true);
    setErrorMessage(null);

    try {
      let res: any;
      if (selectedProc === 'sp_receive_device') {
        res = await workbenchService.executeReceiveDevice(formData);
      } else if (selectedProc === 'sp_process_ticket') {
        res = await workbenchService.executeProcessTicket(formData);
      } else if (selectedProc === 'sp_create_invoice') {
        res = await workbenchService.executeCreateInvoice(formData);
      } else if (selectedProc === 'sp_add_invoice_part') {
        res = await workbenchService.executeAddInvoicePart(formData);
      } else if (selectedProc === 'sp_checkout_invoice') {
        res = await workbenchService.executeCheckoutInvoice(formData);
      }
      setExecutionResult(res);
    } catch (err: any) {
      console.error('Lỗi thực thi thủ tục', err);
      setErrorMessage(err.message || 'Lỗi phát sinh trong quá trình gọi thủ tục');
    } finally {
      setExecuting(false);
    }
  };

  const tablesToRender: WorkbenchTableComparison[] =
    executionResult?.tables || preview?.tables || [];

  return (
    <div className="space-y-6">
      {/* Danh sách 5 stored procedure */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
        {catalog.map((proc) => {
          const isSelected = proc.id === selectedProc;
          return (
            <button
              key={proc.id}
              onClick={() => initFormForProc(proc.id, sampleData)}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600'
                  : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                {proc.category}
              </span>
              <div className="font-bold text-xs text-stone-900 mt-1.5 leading-snug">{proc.name}</div>
              <div className="text-[11px] font-mono text-stone-500 mt-0.5">{proc.sqlName}</div>
            </button>
          );
        })}
      </div>

      {/* Bảng làm việc chính */}
      {currentProcItem && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-stone-900">{currentProcItem.name}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-bold">
                  {currentProcItem.sqlName}
                </span>
              </div>
              <p className="text-xs text-stone-600 mt-1">{currentProcItem.description}</p>
            </div>

            <button
              type="button"
              onClick={() => initFormForProc(selectedProc, sampleData)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 cursor-pointer text-stone-700 self-start sm:self-auto"
            >
              ↺ Tải Dữ Liệu Mẫu Mới
            </button>
          </div>

          {/* Form tham số đầu vào */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Tham Số Đầu Vào (Input Parameters)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {currentProcItem.parameters.map((param) => (
                <div key={param.name} className="space-y-1">
                  <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                    <span>
                      @{param.name} {param.required && <span className="text-rose-500">*</span>}
                    </span>
                    <span className="text-[10px] text-stone-400 font-normal">({param.type})</span>
                  </label>

                  {param.type === 'select' && param.options ? (
                    <select
                      value={formData[param.name] ?? param.defaultValue ?? ''}
                      onChange={(e) => handleInputChange(param.name, e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    >
                      {param.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={param.type === 'number' ? 'number' : 'text'}
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
                  )}
                  <p className="text-[10px] text-stone-500">{param.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Khối minh bạch câu lệnh SQL thực tế */}
          <div className="space-y-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔍</span>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                  Minh Bạch Dữ Liệu & Câu Lệnh SQL Sẽ Thực Thi
                </span>
              </div>
              <span className="text-[11px] text-indigo-900 font-bold bg-indigo-100 px-2.5 py-0.5 rounded border border-indigo-200">
                {preview?.targetDesc || 'Đang nạp thông tin đối tượng mục tiêu...'}
              </span>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-stone-800 bg-stone-950 text-stone-100 p-3.5 shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800 text-[10px] text-stone-400 font-mono">
                <span>T-SQL Stored Procedure Call (Tham số lấy trực tiếp từ form)</span>
                <span className="text-emerald-400 font-bold">SQL Server 2022</span>
              </div>
              <pre className="font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre text-emerald-300">
                <code>{executionResult?.exactSql || preview?.exactSql || 'Đang chuẩn bị câu lệnh T-SQL...'}</code>
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <span className="text-xs text-stone-600">
                Nhấn nút bên cạnh để gọi thủ tục trên SQL Server và quan sát bảng đối chiếu thay đổi dữ liệu:
              </span>

              <button
                disabled={executing || loadingPreview}
                onClick={handleExecute}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shrink-0"
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Đang thực thi thủ tục trên Database...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Thực Thi Thủ Tục: {currentProcItem.sqlName}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Thông báo lỗi nếu có */}
          {errorMessage && (
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-semibold">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span>⚠️ Lỗi Ràng Buộc / Ngoại Lệ Database:</span>
              </div>
              <p className="font-mono">{errorMessage}</p>
            </div>
          )}

          {/* Thông báo kết quả thành công */}
          {executionResult && (
            <div className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-950 space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                <span>✓</span>
                <span>Thủ tục đã thực thi thành công!</span>
              </div>
              <p className="text-xs font-mono bg-white p-2.5 rounded-lg border border-emerald-300 font-semibold text-emerald-900">
                {executionResult.message || 'Thao tác đã commit thành công vào database.'}
              </p>
            </div>
          )}

          {/* KHỐI 2 BẢNG ĐỐI CHIẾU DỮ LIỆU: TRƯỚC VÀ SAU KHI GỌI THỦ TỤC */}
          <div className="space-y-8 pt-4 border-t border-stone-200">
            {/* PHẦN 1: DỮ LIỆU BAN ĐẦU (TRƯỚC KHI THỰC HIỆN THỦ TỤC) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-200">
                <span className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs"></span>
                  1. Dữ Liệu Gốc Ban Đầu (TRƯỚC KHI THỰC HIỆN THỦ TỤC)
                </span>
                <span className="text-xs text-stone-600 font-medium">
                  Trạng thái thực tế trong database của các bảng mục tiêu trước khi chạy thủ tục
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

            {/* PHẦN 2: DỮ LIỆU THỰC TẾ SAU KHI THỦ TỤC ĐÃ THỰC THI (SAU KHI THỰC HIỆN) */}
            {executionResult && (
              <div className="space-y-4 pt-4 border-t border-stone-200 animate-in fade-in">
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-950">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs"></span>
                    2. Dữ Liệu Thực Tế Sau Khi Thủ Tục Đã Thực Thi (SAU KHI THỰC HIỆN)
                  </span>
                  <span className="text-xs font-bold text-emerald-900">
                    ✓ Xác nhận cập nhật: Dữ liệu đã thay đổi và commit vào cơ sở dữ liệu
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
                      badgeText="SAU KHI THỦ TỤC CẬP NHẬT"
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
