'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { ProcedureCatalogItem } from '../types';
import { DataTableView } from './DataTableView';

export const ProceduresTab: React.FC = () => {
  const [catalog, setCatalog] = useState<ProcedureCatalogItem[]>([]);
  const [selectedProc, setSelectedProc] = useState<string>('sp_receive_device');
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

  const initFormForProc = (procId: string, samples: any) => {
    setSelectedProc(procId);
    setExecutionResult(null);
    setErrorMessage(null);

    if (procId === 'sp_receive_device') {
      const devId = samples?.devices?.[0]?.id || 1;
      const recId = samples?.receptionists?.[0]?.id || 1;
      setFormData({
        device_id: devId,
        receptionist_id: recId,
        issue_description: 'Màn hình chớp nháy và thiết bị nóng nhanh khi chạy tác vụ nặng',
        initial_condition: 'Trầy nhẹ nắp lưng, màn hình và bàn phím còn nguyên vẹn',
        accessories: 'Củ sạc zin 65W, Cáp Type-C, Túi chống sốc',
        ticket_type: 'repair',
      });
    } else if (procId === 'sp_process_ticket') {
      const tickId = samples?.tickets?.[0]?.id || 1;
      const techId = samples?.technicians?.[0]?.id || 1;
      setFormData({
        ticket_id: tickId,
        status: 'repairing',
        technician_id: techId,
        fault_cause: 'Tụ lọc nguồn CPU bị phù và keo tản nhiệt bị khô cứng',
        repair_solution: 'Thay thế tụ lọc nguồn và tra lại keo tản nhiệt gốm cao cấp',
        estimated_cost: 150,
      });
    } else if (procId === 'sp_create_invoice') {
      const tickId = samples?.tickets?.[0]?.id || 1;
      setFormData({
        ticket_id: tickId,
        labor_fee: 120,
      });
    } else if (procId === 'sp_add_invoice_part') {
      const invId = samples?.unpaidInvoices?.[0]?.id || 1;
      const partId = samples?.parts?.[0]?.id || 1;
      setFormData({
        invoice_id: invId,
        part_id: partId,
        quantity: 1,
      });
    } else if (procId === 'sp_checkout_invoice') {
      const invId = samples?.completedTickets?.[0]?.invoice_id || samples?.unpaidInvoices?.[0]?.id || 1;
      setFormData({
        invoice_id: invId,
        payment_method: 'cash',
      });
    }
  };

  const handleInputChange = (name: string, val: any) => {
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const currentProcItem = catalog.find((p) => p.id === selectedProc);

  const handleExecute = async () => {
    setExecuting(true);
    setErrorMessage(null);
    setExecutionResult(null);

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
              ↻ Tải Dữ Liệu Mẫu Mới
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

            <div className="pt-2">
              <button
                disabled={executing}
                onClick={handleExecute}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Đang thực thi thủ tục trên SQL Server...</span>
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

          {/* Kết quả: 2 Bảng TRƯỚC vs SAU khi thực hiện */}
          {executionResult && (
            <div className="space-y-6 pt-4 border-t border-stone-100">
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-xs text-emerald-900 font-semibold flex flex-wrap items-center justify-between gap-2">
                <span>
                  ✓ Thủ tục đã thực thi thành công! So sánh đối chiếu trạng thái dữ liệu trước và sau bên dưới:
                </span>
                {executionResult.newTicketId && (
                  <span className="bg-emerald-200 px-2 py-0.5 rounded font-mono font-bold">
                    Ticket ID vừa tạo: #{executionResult.newTicketId}
                  </span>
                )}
                {executionResult.newInvoiceId && (
                  <span className="bg-emerald-200 px-2 py-0.5 rounded font-mono font-bold">
                    Invoice ID vừa tạo: #{executionResult.newInvoiceId}
                  </span>
                )}
              </div>

              {/* Bảng 1: TRƯỚC */}
              <div className="space-y-2">
                <DataTableView
                  title="Dữ liệu liên quan: TRƯỚC KHI THỰC THI THỦ TỤC"
                  data={executionResult.before}
                  variant="before"
                  subtitle="Dữ liệu ban đầu được truy vấn ngay trước khi gọi thủ tục"
                />
              </div>

              {/* Bảng 2: SAU */}
              <div className="space-y-2">
                <DataTableView
                  title="Dữ liệu liên quan: SAU KHI THỰC THI THỦ TỤC"
                  data={executionResult.after}
                  variant="after"
                  subtitle="Dữ liệu cập nhật mới nhất sau khi thủ tục đã commit vào cơ sở dữ liệu"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
