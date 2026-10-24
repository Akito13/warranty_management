export interface TableOverviewItem {
  tableName: string;
  rowCount: number;
}

export interface TableColumn {
  name: string;
  type: string;
  isNullable: boolean;
}

export interface TableDataResponse {
  tableName: string;
  columns: TableColumn[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: Array<Record<string, any>>;
}

export interface ProcedureCatalogItem {
  id: string;
  name: string;
  sqlName: string;
  category: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    defaultValue?: any;
    options?: string[];
  }>;
}

export interface FunctionCatalogItem {
  id: string;
  name: string;
  sqlName: string;
  type: 'scalar' | 'table_valued';
  returnType: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    defaultValue?: any;
  }>;
}

export interface CursorCatalogItem {
  id: string;
  name: string;
  sqlName: string;
  cursorName: string;
  cursorType: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: any;
    description: string;
  }>;
}

export interface TriggerCatalogItem {
  id: string;
  name: string;
  table: string;
  timing: string;
  type: 'guard' | 'cascade' | 'audit';
  description: string;
  scenarios: Array<{
    id: string;
    title: string;
    description: string;
    expectedOutcome: 'STOPPED' | 'MODIFIED';
    actionDescription: string;
  }>;
}

export interface TriggerExecutionResult {
  success: boolean;
  stopped: boolean;
  triggerName: string;
  reason?: string;
  errorCode?: number;
  before?: any;
  after?: any;
  relatedItems?: any;
  message: string;
}

