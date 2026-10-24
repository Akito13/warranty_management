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
      console.error('Lỗi khi tải danh mục con trỏ', err);
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
      console.error('Lỗi thực thi con trỏ', err);
      setErrorMessage(err.message || 'Lỗi phát sinh trong quá trình duyệt con trỏ');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Thẻ chọn con trỏ */}
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
          <div className="pb-4 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-stone-900">{currentCursorItem.name}</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-bold">
                {currentCursorItem.cursorName}
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1">{currentCursorItem.description}</p>
          </div>

          {/* Form tùy chọn */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Tùy Chọn Thực Thi Con Trỏ (Cursor Execution Options)
            </h4>

            {selectedCursor === 'sp_audit_invoices' ? (
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
                    onChange={(e) => setAutoFix(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
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
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden font-mono"
                />
                <p className="text-[10px] text-stone-500">
                  Con trỏ sẽ lọc ra các phiếu tiếp nhận cách đây hơn {delayDays} ngày nhưng chưa hoàn thành hoặc chưa giao.
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
                    <span>Đang duyệt con trỏ trên SQL Server...</span>
                  </>
                ) : (
                  <>
                    <span>🔁 Chạy Con Trỏ: {currentCursorItem.sqlName}</span>
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
              {/* Thẻ tóm tắt kết quả */}
              <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200 flex flex-wrap items-center justify-between gap-3">
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

              {/* Bảng 1: TRƯỚC */}
              <div className="space-y-2">
                <DataTableView
                  title={
                    selectedCursor === 'sp_audit_invoices'
                      ? 'Dữ liệu hóa đơn (TRƯỚC KHI CHẠY CON TRỎ ĐỐI SOÁT)'
                      : 'Toàn bộ phiếu chưa hoàn thành (TRƯỚC KHI CON TRỎ LỌC)'
                  }
                  data={executionResult.before}
                  variant="before"
                  subtitle="Tập dữ liệu ban đầu trước khi con trỏ duyệt từng dòng"
                />
              </div>

              {/* Bảng 2: SAU */}
              <div className="space-y-2">
                <DataTableView
                  title={
                    selectedCursor === 'sp_audit_invoices'
                      ? 'Dữ liệu hóa đơn (SAU KHI ĐỐI SOÁT HÒA ĐỒNG BỘ)'
                      : 'Tập dữ liệu phiếu quá hạn (DO CON TRỎ TẠO RA)'
                  }
                  data={executionResult.after}
                  variant="after"
                  subtitle="Kết quả được con trỏ tính toán và tạo ra sau vòng lặp WHILE @@FETCH_STATUS = 0"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
