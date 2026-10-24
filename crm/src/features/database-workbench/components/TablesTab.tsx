'use client';

import React, { useEffect, useState } from 'react';
import { workbenchService } from '../services/workbench.service';
import { TableDataResponse, TableOverviewItem } from '../types';
import { DataTableView } from './DataTableView';

export const TablesTab: React.FC = () => {
  const [tables, setTables] = useState<TableOverviewItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('tickets');
  const [tableData, setTableData] = useState<TableDataResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Load table list
  useEffect(() => {
    loadOverview();
  }, []);

  // Load selected table data
  useEffect(() => {
    if (selectedTable) {
      loadData(selectedTable, page, search);
    }
  }, [selectedTable, page]);

  const loadOverview = async () => {
    try {
      const list = await workbenchService.getTablesOverview();
      setTables(list);
      if (list.length > 0 && !selectedTable) {
        setSelectedTable(list[0].tableName);
      }
    } catch (err) {
      console.error('Failed to load tables overview', err);
    }
  };

  const loadData = async (tbl: string, p: number, q?: string) => {
    setLoading(true);
    try {
      const res = await workbenchService.getTableData(tbl, p, 20, q);
      setTableData(res);
    } catch (err) {
      console.error('Failed to load table data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData(selectedTable, 1, search);
  };

  return (
    <div className="space-y-6">
      {/* Table selector cards */}
      <div>
        <h3 className="text-base font-bold text-stone-900 mb-3 flex items-center justify-between">
          <span>Database Tables (Source: init-db.sql)</span>
          <button
            onClick={() => {
              loadOverview();
              loadData(selectedTable, page, search);
            }}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-stone-300 hover:bg-stone-100 cursor-pointer transition-colors"
          >
            ↻ Refresh All
          </button>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {tables.map((t) => {
            const isSelected = t.tableName === selectedTable;
            return (
              <button
                key={t.tableName}
                onClick={() => {
                  setSelectedTable(t.tableName);
                  setPage(1);
                  setSearch('');
                }}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                <div className="text-xs font-mono font-bold text-stone-900 truncate">
                  {t.tableName}
                </div>
                <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between">
                  <span>Rows:</span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded text-[10px]">
                    {t.rowCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table header & Search */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-stone-900 font-mono">
                dbo.[{selectedTable}]
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700">
                {tableData?.total ?? 0} total records
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Inspecting raw records and schema defined in init-db.sql
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter text..."
              className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 cursor-pointer"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  loadData(selectedTable, 1, '');
                }}
                className="text-xs text-stone-500 hover:text-stone-800 underline"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Live Table View */}
        <div className="mt-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-stone-500 font-mono animate-pulse">
              Fetching records from SQL Server...
            </div>
          ) : (
            <DataTableView
              title={`Table Records: ${selectedTable}`}
              data={tableData?.items || []}
              variant="default"
              subtitle={`Page ${tableData?.page || 1} of ${tableData?.totalPages || 1}`}
            />
          )}
        </div>

        {/* Pagination controls */}
        {tableData && tableData.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-stone-100 text-xs text-stone-600">
            <span>
              Showing {tableData.items.length} of {tableData.total} rows
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="font-mono font-bold text-stone-900 px-2">
                {page} / {tableData.totalPages}
              </span>
              <button
                disabled={page >= tableData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 rounded border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

