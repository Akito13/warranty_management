'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { TriggerCatalogItem, TriggerExecutionResult, TriggerPreviewResult } from '../types';
import { DataTableView } from './DataTableView';

export const TriggersTab: React.FC = () => {
  const [catalog, setCatalog] = useState<TriggerCatalogItem[]>([]);
  const [selectedTriggerId, setSelectedTriggerId] = useState<string>('trg_invoice_items_stock');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('stock_exceeded_fail');
  const [preview, setPreview] = useState<TriggerPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<TriggerExecutionResult | null>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const cat = await workbenchService.getTriggersCatalog();
      setCatalog(cat);
      if (cat.length > 0) {
        setSelectedTriggerId(cat[0].id);
        const firstScenario = cat[0].scenarios[0].id;
        setSelectedScenarioId(firstScenario);
        loadPreview(cat[0].id, firstScenario);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh mục trigger', err);
    }
  };

  const loadPreview = async (triggerId: string, scenarioId: string) => {
    setLoadingPreview(true);
    setResult(null);
    try {
      const res = await workbenchService.getTriggerPreview(triggerId, scenarioId);
      setPreview(res);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu xem trước trigger', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSelectTrigger = (triggerId: string) => {
    setSelectedTriggerId(triggerId);
    setResult(null);
    const trig = catalog.find((t) => t.id === triggerId);
    const scenId = trig && trig.scenarios.length > 0 ? trig.scenarios[0].id : '';
    setSelectedScenarioId(scenId);
    if (scenId) {
      loadPreview(triggerId, scenId);
    }
  };

  const handleSelectScenario = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setResult(null);
    loadPreview(selectedTriggerId, scenarioId);
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
      console.error('Lỗi khi kích hoạt trigger', err);
      setResult({
        success: false,
        stopped: true,
        triggerName: selectedTriggerId,
        reason: err.message || 'Trigger đã chặn thao tác và thực hiện ROLLBACK TRANSACTION.',
        message: `${selectedTriggerId} đã chặn thao tác này do: ${err.message || 'Lỗi cơ sở dữ liệu'}`,
      });
    } finally {
      setExecuting(false);
    }
  };

  const tablesToRender = result?.tables || preview?.tables || [];

  return (
    <div className="space-y-6">
      {/* 1. Thanh chọn 7 Triggers */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-bold text-stone-900">
            Kiểm Thử 7 Triggers Nghiệp Vụ (Sự Kiện Độc Lập)
          </h3>
          <span className="text-xs text-stone-500 font-mono">
            {catalog.length} triggers được định nghĩa trong init-db.sql
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
                    ? 'border-indigo-600 bg-indigo-50/80 shadow-xs ring-2 ring-indigo-600'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      trig.type === 'guard'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : trig.type === 'cascade'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}
                  >
                    {trig.typeLabel || trig.type}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400 font-semibold">ON {trig.table}</span>
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

      {/* 2. Bảng làm việc của Trigger đã chọn */}
      {currentTrigger && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-6">
          {/* Header & Thông tin Trigger */}
          <div className="pb-4 border-b border-stone-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-extrabold font-mono text-stone-900">
                  {currentTrigger.name}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase bg-stone-100 text-stone-700 font-mono">
                  BẢNG [{currentTrigger.table}] • {currentTrigger.timing}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded border border-stone-200">
                Loại: {currentTrigger.typeLabel || currentTrigger.type.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
              {currentTrigger.description}
            </p>
          </div>

          {/* Chọn kịch bản kiểm thử */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Chọn Kịch Bản Kiểm Thử (Test Scenario):
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentTrigger.scenarios.map((scen) => {
                const isSelected = scen.id === selectedScenarioId;
                const isStop = scen.expectedOutcome === 'STOPPED';

                return (
                  <button
                    key={scen.id}
                    onClick={() => handleSelectScenario(scen.id)}
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
                        {isStop ? '🛑 KỲ VỌNG: TRIGGER CHẶN LẠI (ROLLBACK)' : '🟢 KỲ VỌNG: TRIGGER TỰ ĐỘNG CẬP NHẬT'}
                      </span>
                    </div>

                    <div className="font-bold text-xs text-stone-900 mt-2">{scen.title}</div>
                    <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">{scen.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Khối hiển thị MINH BẠCH LỆNH SQL VÀ DỮ LIỆU MỤC TIÊU CỤ THỂ */}
          {currentScenario && (
            <div className="space-y-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔍</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                    Minh Bạch Dữ Liệu & Câu Lệnh SQL Sẽ Thực Thi
                  </span>
                </div>
                <span className="text-[11px] text-indigo-900 font-bold bg-indigo-100 px-2.5 py-0.5 rounded border border-indigo-200">
                  {preview?.targetDesc || 'Đang tải thông tin đối tượng...'}
                </span>
              </div>

              {/* Hộp mã SQL thực tế */}
              <div className="relative rounded-xl overflow-hidden border border-stone-800 bg-stone-950 text-stone-100 p-3.5 shadow-inner">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800 text-[10px] text-stone-400 font-mono">
                  <span>T-SQL Query (Giá trị thực tế lấy trực tiếp từ database)</span>
                  <span className="text-emerald-400 font-bold">SQL Server 2022</span>
                </div>
                <pre className="font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre text-emerald-300">
                  <code>{result?.exactSql || preview?.exactSql || 'Đang chuẩn bị câu lệnh T-SQL...'}</code>
                </pre>
              </div>

              {/* Nút bấm kích hoạt sự kiện */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-xs text-stone-600">
                  Nhấn nút bên cạnh để gửi câu lệnh trên vào SQL Server và kiểm tra phản ứng của Trigger:
                </span>

                <button
                  disabled={executing || loadingPreview}
                  onClick={handleRunTriggerEvent}
                  className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all shrink-0 ${
                    currentScenario.expectedOutcome === 'STOPPED'
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  }`}
                >
                  {executing ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Đang gửi sự kiện vào Database...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {currentScenario.expectedOutcome === 'STOPPED'
                          ? '🛑 Kích Hoạt Sự Kiện (Kiểm thử Trigger CHẶN THAO TÁC)'
                          : '🟢 Kích Hoạt Sự Kiện (Kiểm thử Trigger TỰ ĐỘNG CẬP NHẬT)'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* BANNER THÔNG BÁO TRIGGER CHẶN THAO TÁC RÕ RÀNG */}
          {result && result.stopped && (
            <div className="p-5 rounded-2xl border-2 border-rose-500 bg-rose-50 shadow-sm text-rose-950 space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-sm text-rose-900">
                <span className="text-xl">⛔</span>
                <span>Xác Nhận Trigger Hoạt Động Chính Xác: Thao Tác Bị Chặn & Giao Dịch Đã Rollback!</span>
              </div>
              <div className="p-3.5 bg-white rounded-xl border border-rose-300 font-mono text-xs font-bold text-rose-950 shadow-2xs">
                {result.triggerName} stopped this action due to: {result.reason}
              </div>
              <p className="text-xs text-rose-900 leading-relaxed font-medium">
                Trigger <code className="font-bold font-mono text-rose-950 bg-rose-200 px-1 py-0.5 rounded">{result.triggerName}</code> đã tự động bắt được hành vi vi phạm ràng buộc nghiệp vụ, gọi lệnh <code className="font-mono font-bold">ROLLBACK TRANSACTION</code> và ném mã lỗi <code className="font-mono font-bold">{result.errorCode || '500xx'}</code>. Dữ liệu gốc trong các bảng được bảo toàn nguyên vẹn như đối chiếu bên dưới.
              </p>
            </div>
          )}

          {/* BANNER THÔNG BÁO TRIGGER TỰ ĐỘNG CẬP NHẬT THÀNH CÔNG */}
          {result && !result.stopped && (
            <div className="p-5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 shadow-sm text-emerald-950 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-sm text-emerald-900">
                <span className="text-xl">✓</span>
                <span>Trigger Đã Thực Thi Tự Động: Dữ Liệu Đã Được Cập Nhật Thành Công!</span>
              </div>
              <p className="text-xs text-emerald-950 font-mono bg-white p-3 rounded-xl border border-emerald-300 font-bold">
                {result.message}
              </p>
              <p className="text-xs text-emerald-900 font-medium">
                Dữ liệu mới đã được trigger tự động tính toán / cập nhật trực tiếp trong database. Bạn có thể xem bảng đối chiếu chi tiết bên dưới.
              </p>
            </div>
          )}

          {/* ĐỐI CHIẾU CÁC BẢNG DỮ LIỆU LIÊN QUAN: TRƯỚC VÀ SAU KHI TRIGGER CHẠY */}
          <div className="space-y-8 pt-4 border-t border-stone-200">
            {/* PHẦN 1: DỮ LIỆU BAN ĐẦU (TRƯỚC KHI THỰC HIỆN) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-200">
                <span className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs"></span>
                  1. Dữ Liệu Gốc Ban Đầu (TRƯỚC KHI TÁC ĐỘNG)
                </span>
                <span className="text-xs text-stone-600 font-medium">
                  Trạng thái thực tế các bảng liên quan được truy vấn trước thời điểm thực thi
                </span>
              </div>

              {loadingPreview ? (
                <div className="py-8 text-center text-xs text-stone-500 font-mono animate-pulse">
                  Đang truy vấn trạng thái dữ liệu gốc từ SQL Server...
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

            {/* PHẦN 2: DỮ LIỆU THỰC TẾ SAU KHI TRIGGER XỬ LÝ (HIỂN THỊ KHI ĐÃ BẤM KÍCH HOẠT) */}
            {result && (
              <div className="space-y-4 pt-4 border-t border-stone-200 animate-in fade-in">
                <div
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${
                    result.stopped
                      ? 'bg-rose-50 border-rose-200 text-rose-950'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shadow-xs ${
                        result.stopped ? 'bg-rose-600' : 'bg-emerald-600'
                      }`}
                    ></span>
                    2. Dữ Liệu Thực Tế Sau Khi Trigger Xử Lý (SAU KHI THỰC HIỆN)
                  </span>
                  <span className="text-xs font-bold">
                    {result.stopped
                      ? '✓ Xác nhận Rollback: Dữ liệu được bảo toàn nguyên vẹn (Không thay đổi)'
                      : '✓ Xác nhận Cập nhật: Dữ liệu đã thay đổi theo hành vi Trigger'}
                  </span>
                </div>

                <div className="space-y-4">
                  {tablesToRender.map((tbl, idx) => (
                    <DataTableView
                      key={`${tbl.tableName}-after-${idx}`}
                      title={tbl.tableTitle}
                      subtitle={tbl.description}
                      data={tbl.afterRows || tbl.beforeRows}
                      variant={result.stopped ? 'error' : 'after'}
                      badgeText={
                        result.stopped
                          ? 'BẢO TOÀN DỮ LIỆU (ĐÃ ROLLBACK)'
                          : 'SAU KHI TRIGGER CẬP NHẬT'
                      }
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
