import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const ALLOWED_TABLES = [
  'customers',
  'employees',
  'devices',
  'parts',
  'tickets',
  'invoices',
  'invoice_items',
  'ticket_status_history',
] as const;

export type AllowedTableName = (typeof ALLOWED_TABLES)[number];

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Return an overview of all 8 core tables with row counts.
   */
  async getTablesOverview() {
    const summary: Array<{ tableName: string; rowCount: number }> = [];

    for (const table of ALLOWED_TABLES) {
      try {
        const countRes = await this.dataSource.query(`SELECT COUNT(1) AS cnt FROM dbo.[${table}]`);
        const count = countRes && countRes[0] ? Number(countRes[0].cnt) : 0;
        summary.push({ tableName: table, rowCount: count });
      } catch (err: any) {
        this.logger.error(`Failed to get count for table ${table}: ${err.message}`);
        summary.push({ tableName: table, rowCount: 0 });
      }
    }

    return summary;
  }

  /**
   * Return paginated rows and column metadata for a specific table.
   */
  async getTableData(
    tableName: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
  ) {
    if (!ALLOWED_TABLES.includes(tableName as AllowedTableName)) {
      throw new BadRequestException(
        `Table '${tableName}' is not in the allowed schema list: ${ALLOWED_TABLES.join(', ')}`,
      );
    }

    const safeLimit = Math.min(Math.max(1, limit || 20), 100);
    const safePage = Math.max(1, page || 1);
    const offset = (safePage - 1) * safeLimit;

    // Get column definitions
    const columnsRaw = await this.dataSource.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = @0 
       ORDER BY ORDINAL_POSITION`,
      [tableName],
    );

    const columns = columnsRaw.map((c: any) => ({
      name: c.COLUMN_NAME,
      type: c.DATA_TYPE,
      isNullable: c.IS_NULLABLE === 'YES',
    }));

    // Build query with optional simple search
    let whereClause = '';
    const queryParams: any[] = [];

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      // Search on text/varchar columns
      const textColumns = columnsRaw
        .filter((c: any) =>
          ['nvarchar', 'varchar', 'text', 'ntext', 'char', 'nchar'].includes(
            c.DATA_TYPE.toLowerCase(),
          ),
        )
        .map((c: any) => `[${c.COLUMN_NAME}] LIKE @0`);

      if (textColumns.length > 0) {
        whereClause = `WHERE ${textColumns.join(' OR ')}`;
        queryParams.push(term);
      }
    }

    // Determine order column
    const hasId = columnsRaw.some((c: any) => c.COLUMN_NAME.toLowerCase() === 'id');
    const orderColumn = hasId ? '[id] DESC' : '(SELECT NULL)';

    const countQuery = `SELECT COUNT(1) AS total FROM dbo.[${tableName}] ${whereClause}`;
    const countRes = await this.dataSource.query(countQuery, queryParams);
    const total = countRes && countRes[0] ? Number(countRes[0].total) : 0;

    const dataQuery = `
      SELECT * FROM dbo.[${tableName}]
      ${whereClause}
      ORDER BY ${orderColumn}
      OFFSET ${offset} ROWS
      FETCH NEXT ${safeLimit} ROWS ONLY
    `;

    const rawRows = await this.dataSource.query(dataQuery, queryParams);

    // Mask sensitive fields if employees table
    const rows = rawRows.map((r: any) => {
      const copy = { ...r };
      if (tableName === 'employees') {
        if ('password_hash' in copy) copy.password_hash = '***MASKED***';
        if ('refresh_token_hash' in copy && copy.refresh_token_hash)
          copy.refresh_token_hash = '***MASKED***';
      }
      return copy;
    });

    return {
      tableName,
      columns,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      items: rows,
    };
  }
}

