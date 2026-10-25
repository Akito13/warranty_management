'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { CursorCatalogItem, CursorPreviewResult, WorkbenchTableComparison } from '../types';
import { DataTableView } from './DataTableView';

export const CursorsTab: React.FC = () => {
  const [catalog, setCatalog] = useState<CursorCatalogItem[]>([]);
  const [selectedCursor, setSelectedCursor] = useState<string>('sp_audit_invoices');
  const [autoFix, setAutoFix] = useState<boolean>(false);
  const [delayDays, setDelayDays] = useState<number>(7);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [preview, setPreview] = useState<CursorPreviewResult | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simulateMessage, setSimulateMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const list = await workbenchService.getCursorsCatalog();
      setCatalog(list);
      if (list.length > 0) {
        setSelectedCursor(list[0].id);
        fetchPreview(list[0].id, { auto_fix: false, delay_days: 7 });
      }
    } catch (err) {
      console.error('Lỗi khi tải danh mục con trỏ', err);
    }
  };

  const fetchPreview = async (curId: string, params: Record<string, any>) => {
    setLoadingPreview(true);
    try {
      const prev = await workbenchService.getCursorPreview(curId, params);
      setPreview(prev);
    } catch (err) {
      console.error('Lỗi khi tải preview cursor', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSelectCursor = (curId: string) => {
    setSelectedCursor(curId);
    setExecutionResult(null);
    setErrorMessage(null);
    setSimulateMessage(null);
    fetchPreview(curId, { auto_fix: autoFix, delay_days: delayDays });
  };

  const handleToggleAutoFix = (checked: boolean) => {
    setAutoFix(checked);
    fetchPreview(selectedCursor, { auto_fix: checked, delay_days: delayDays });
  };

  const handleChangeDelayDays = (days: number) => {
    setDelayDays(days);
    fetchPreview(selectedCursor, { auto_fix: autoFix, delay_days: days });
  };

  const handleSimulateDiscrepancy = async () => {
    setSimulating(true);
    setSimulateMessage(null);
    setErrorMessage(null);
    try {
      const res = await workbenchService.simulateCursorDiscrepancy();
      setSimulateMessage(res.message);
      // Refresh preview to show the newly created discrepancy
      await fetchPreview(selectedCursor, { auto_fix: autoFix, delay_days: delayDays });
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi tạo dữ liệu thử nghiệm');
    } finally {
      setSimulating(false);
    }
  };

  const currentCursorItem = catalog.find((c) => c.id === selectedCursor);

  const handleExecute = async () => {
    setExecuting(true);
    setErrorMessage(null);

    try {
      let res: any;
      if (selectedCursor === 'sp_audit_invoices') {
        res = await workbenchService.executeAuditInvoices({ auto_fix: autoFix });
      } else {
        res = await workbenchService.executeDelayedTickets({ delay_days: delayDays });
      }
      setExecutionResult(res);
    } catch (err: any) {
      console.error('Lỗi thực thi con trỏ', err);
      setErrorMessage(err.message || 'Lỗi phát sinh trong quá trình duyệt con trỏ');
    } finally {
      setExecuting(false);
    }
  };

  const tablesToRender: WorkbenchTableComparison[] =
    executionResult?.tables || preview?.tables || [];

  return (
    <div className="space-y-6">
      {/* Thẻ chọn con trỏ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {catalog.map((cur) => {
          const isSelected = cur.id === selectedCursor;
          return (
            <button
              key={cur.id}
              onClick={() => handleSelectCursor(cur.id)}
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
              <div className="text-xs font-mono text-indigo-700 mt-1 font-semibold">Khai báo: {cur.cursorName}</div>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">{cur.description}</p>
            </button>
          );
        })}
      </div>

      {/* Bảng làm việc chính */}
      {currentCursorItem && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="pb-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-stone-900">{currentCursorItem.name}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-bold">
                  {currentCursorItem.cursorName}
                </span>
              </div>
              <p className="text-xs text-stone-600 mt-1">{currentCursorItem.description}</p>
            </div>

            <button
              type="button"
              onClick={() => fetchPreview(selectedCursor, { auto_fix: autoFix, delay_days: delayDays })}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 cursor-pointer text-stone-700 self-start sm:self-auto"
            >
              ↺ Tải Lại Dữ Liệu
            </button>
          </div>

          {/* Form tùy chọn */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Tùy Chọn Thực Thi Con Trỏ (Cursor Execution Options)
            </h4>

            {selectedCursor === 'sp_audit_invoices' ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-stone-900">
                      Bật chế độ tự động đồng bộ đối soát (@auto_fix = 1)
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Nếu bật, con trỏ khi duyệt gặp hóa đơn có total_amount không khớp với (tiền công + linh kiện - chiết khấu) sẽ tự động UPDATE đồng bộ lại.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={autoFix}
                      onChange={(e) => handleToggleAutoFix(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* Nút hỗ trợ Demo: Tạo sai lệch dữ liệu thử nghiệm */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-amber-950">
                    <span className="font-bold">🧪 Tiện ích Demo:</span> Nếu toàn bộ hóa đơn hiện đang đúng chuẩn, nhấn nút này để cố tình trừ $100 trên 1 hóa đơn, tạo sai lệch để quan sát con trỏ phát hiện và sửa:
                  </div>
                  <button
                    disabled={simulating}
                    onClick={handleSimulateDiscrepancy}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0 transition-colors shadow-2xs"
                  >
                    {simulating ? 'Đang tạo...' : 'Tạo Sai Lệch Thử Nghiệm (-$100)'}
                  </button>
                </div>

                {simulateMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-900 font-semibold">
                    ✓ {simulateMessage}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-xs space-y-1">
                <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                  <span>Ngưỡng số ngày quá hạn (@delay_days)</span>
                  <span className="font-mono font-bold text-indigo-700">{delayDays} ngày</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={delayDays}
                  onChange={(e) => handleChangeDelayDays(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden font-mono"
                />
                <p className="text-[10px] text-stone-500">
                  Con trỏ sẽ lọc ra các phiếu tiếp nhận cách đây hơn {delayDays} ngày nhưng chưa hoàn thành hoặc chưa giao.
                </p>
              </div>
            )}
          </div>

          {/* Khối minh bạch câu lệnh SQL thực tế */}
          <div className="space-y-3 rounded-2xl border-2 border-cyan-200 bg-cyan-50/40 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cyan-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔍</span>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-950">
                  Minh Bạch Dữ Liệu & Câu Lệnh SQL Sẽ Thực Thi
                </span>
              </div>
              <span className="text-[11px] text-cyan-900 font-bold bg-cyan-100 px-2.5 py-0.5 rounded border border-cyan-200">
                {preview?.targetDesc || 'Đang nạp thông tin con trỏ...'}
              </span>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-stone-800 bg-stone-950 text-stone-100 p-3.5 shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800 text-[10px] text-stone-400 font-mono">
                <span>T-SQL Cursor Call (Tham số cấu hình con trỏ)</span>
                <span className="text-cyan-400 font-bold">SQL Server 2022</span>
              </div>
              <pre className="font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre text-cyan-300">
                <code>{executionResult?.exactSql || preview?.exactSql || 'Đang chuẩn bị câu lệnh T-SQL...'}</code>
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <span className="text-xs text-stone-600">
                Nhấn nút bên cạnh để mở và duyệt con trỏ trên SQL Server:
              </span>

              <button
                disabled={executing || loadingPreview}
                onClick={handleExecute}
                className="px-6 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shrink-0"
              >
                {executing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Đang duyệt con trỏ trên SQL Server...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Chạy Con Trỏ: {currentCursorItem.sqlName}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lỗi nếu có */}
          {errorMessage && (
            <div className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs font-semibold">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span>⚠️ Lỗi Con Trỏ:</span>
              </div>
              <p className="font-mono">{errorMessage}</p>
            </div>
          )}

          {/* Kết quả tóm tắt */}
          {executionResult && (
            <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
              <div>
                <span className="text-xs uppercase font-bold text-cyan-800">
                  Tóm Tắt Kết Quả Duyệt Con Trỏ
                </span>
                <div className="text-sm font-semibold text-stone-900 mt-1">
                  {selectedCursor === 'sp_audit_invoices' ? (
                    <span>
                      Số hóa đơn phát hiện sai lệch:{' '}
                      <strong className="text-indigo-700 font-mono text-base">
                        {executionResult.result?.discrepancies_found ?? 0}
                      </strong>{' '}
                      | Trạng thái tự động sửa:{' '}
                      <strong className={executionResult.result?.was_auto_fixed ? 'text-emerald-700' : 'text-stone-600'}>
                        {executionResult.result?.was_auto_fixed ? 'ĐÃ ĐỒNG BỘ CẬP NHẬT' : 'CHỈ ĐỐI SOÁT (KHÔNG SỬA)'}
                      </strong>
                    </span>
                  ) : (
                    <span>
                      Số phiếu quá hạn con trỏ tìm được:{' '}
                      <strong className="text-rose-700 font-mono text-base">
                        {executionResult.totalOverdueFound ?? 0}
                      </strong>{' '}
                      (ngưỡng trễ &gt; {executionResult.delayDays} ngày)
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs font-mono text-cyan-900 bg-cyan-200/70 px-2.5 py-1 rounded-lg font-bold">
                {executionResult.cursorUsed}
              </span>
            </div>
          )}

          {/* KHỐI 2 BẢNG ĐỐI CHIẾU DỮ LIỆU: TRƯỚC VÀ SAU KHI CHẠY CON TRỎ */}
          <div className="space-y-8 pt-4 border-t border-stone-200">
            {/* PHẦN 1: DỮ LIỆU BAN ĐẦU (TRƯỚC KHI CON TRỎ DUYỆT) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-200">
                <span className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs"></span>
                  1. Dữ Liệu Gốc Ban Đầu (TRƯỚC KHI CON TRỎ DUYỆT)
                </span>
                <span className="text-xs text-stone-600 font-medium">
                  Trạng thái thực tế các dòng trong database trước thời điểm con trỏ OPEN và FETCH
                </span>
              </div>

              {loadingPreview ? (
                <div className="py-8 text-center text-xs text-stone-500 font-mono animate-pulse">
                  Đang tải dữ liệu ban đầu từ SQL Server...
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

            {/* PHẦN 2: DỮ LIỆU THỰC TẾ SAU KHI CON TRỎ ĐÃ XỬ LÝ (SAU KHI THỰC HIỆN) */}
            {executionResult && (
              <div className="space-y-4 pt-4 border-t border-stone-200 animate-in fade-in">
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border bg-cyan-50 border-cyan-200 text-cyan-950">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 shadow-xs"></span>
                    2. Dữ Liệu Thực Tế Sau Khi Con Trỏ Đã Xử Lý (SAU KHI THỰC HIỆN)
                  </span>
                  <span className="text-xs font-bold text-cyan-900">
                    ✓ Xác nhận kết quả con trỏ: Duyệt hoàn tất và trả về kết quả
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
                      badgeText="SAU KHI CON TRỎ DUYỆT"
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
