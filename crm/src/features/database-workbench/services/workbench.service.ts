import { api } from '@/lib/api-client';
import {
  CursorCatalogItem,
  FunctionCatalogItem,
  ProcedureCatalogItem,
  TableDataResponse,
  TableOverviewItem,
  TriggerCatalogItem,
  TriggerExecutionResult,
  TriggerPreviewResult,
} from '../types';

export const workbenchService = {
  // 1. Tables
  async getTablesOverview(): Promise<TableOverviewItem[]> {
    return api.get<TableOverviewItem[]>('/tables');
  },

  async getTableData(
    tableName: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
  ): Promise<TableDataResponse> {
    return api.get<TableDataResponse>(`/tables/${tableName}`, { page, limit, search });
  },

  // 2. Procedures
  async getProceduresCatalog(): Promise<ProcedureCatalogItem[]> {
    return api.get<ProcedureCatalogItem[]>('/procedures');
  },

  async getProcedureSampleData(): Promise<any> {
    return api.get<any>('/procedures/sample-data');
  },

  async executeReceiveDevice(params: any): Promise<any> {
    return api.post<any>('/procedures/receive-device', params);
  },

  async executeProcessTicket(params: any): Promise<any> {
    return api.post<any>('/procedures/process-ticket', params);
  },

  async executeCreateInvoice(params: any): Promise<any> {
    return api.post<any>('/procedures/create-invoice', params);
  },

  async executeAddInvoicePart(params: any): Promise<any> {
    return api.post<any>('/procedures/add-invoice-part', params);
  },

  async executeCheckoutInvoice(params: any): Promise<any> {
    return api.post<any>('/procedures/checkout-invoice', params);
  },

  // 3. Functions
  async getFunctionsCatalog(): Promise<FunctionCatalogItem[]> {
    return api.get<FunctionCatalogItem[]>('/functions');
  },

  async getFunctionSampleData(): Promise<any> {
    return api.get<any>('/functions/sample-data');
  },

  async executeCalculatePartsTotal(params: any): Promise<any> {
    return api.post<any>('/functions/calculate-parts-total', params);
  },

  async executeIsDeviceUnderWarranty(params: any): Promise<any> {
    return api.post<any>('/functions/is-device-under-warranty', params);
  },

  async executeDeviceRepairHistory(params: any): Promise<any> {
    return api.post<any>('/functions/device-repair-history', params);
  },

  // 4. Cursors
  async getCursorsCatalog(): Promise<CursorCatalogItem[]> {
    return api.get<CursorCatalogItem[]>('/cursors');
  },

  async executeAuditInvoices(params: any): Promise<any> {
    return api.post<any>('/cursors/audit-invoices', params);
  },

  async executeDelayedTickets(params: any): Promise<any> {
    return api.post<any>('/cursors/delayed-tickets', params);
  },

  // 5. Triggers
  async getTriggersCatalog(): Promise<TriggerCatalogItem[]> {
    return api.get<TriggerCatalogItem[]>('/triggers');
  },

  async getTriggerSampleData(): Promise<any> {
    return api.get<any>('/triggers/sample-data');
  },

  async getTriggerPreview(
    trigger_id: string,
    scenario_id: string,
  ): Promise<TriggerPreviewResult> {
    return api.get<TriggerPreviewResult>('/triggers/preview', {
      trigger_id,
      scenario_id,
    });
  },

  async executeTriggerTest(params: {
    trigger_id: string;
    scenario_id: string;
    params?: Record<string, any>;
  }): Promise<TriggerExecutionResult> {
    return api.post<TriggerExecutionResult>('/triggers/test', params);
  },
};

