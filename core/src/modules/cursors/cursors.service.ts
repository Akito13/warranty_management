import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

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

@Injectable()
export class CursorsService {
  private readonly logger = new Logger(CursorsService.name);

  constructor(private readonly dataSource: DataSource) {}

  getCatalog(): CursorCatalogItem[] {
    return [
      {
        id: 'sp_audit_invoices',
        name: 'Audit Invoices with Discrepancy Cursor',
        sqlName: 'dbo.sp_audit_invoices',
        cursorName: 'cur_invoices CURSOR LOCAL FAST_FORWARD',
        cursorType: 'LOCAL FAST_FORWARD',
        description:
          'Iterates through every invoice row-by-row using a T-SQL cursor, computes expected total using fn_calculate_parts_total, detects discrepancies, and optionally auto-reconciles them.',
        parameters: [
          {
            name: 'auto_fix',
            type: 'boolean',
            required: false,
            defaultValue: false,
            description: 'If true, automatically updates invoices with reconciled total amounts',
          },
        ],
      },
      {
        id: 'sp_alert_delayed_tickets',
        name: 'Alert Delayed Tickets Cursor',
        sqlName: 'dbo.sp_alert_delayed_tickets',
        cursorName: 'cur_delayed_tickets CURSOR LOCAL FAST_FORWARD',
        cursorType: 'LOCAL FAST_FORWARD',
        description:
          'Iterates through active tickets using a T-SQL cursor, calculates overdue days exceeding threshold, and yields an actionable alert dataset.',
        parameters: [
          {
            name: 'delay_days',
            type: 'number',
            required: false,
            defaultValue: 7,
            description: 'Day threshold to classify a ticket as delayed / overdue',
          },
        ],
      },
    ];
  }

  /**
   * 1. sp_audit_invoices (Cursor)
   */
  async executeAuditInvoices(dto: { auto_fix?: boolean }) {
    const autoFix = Boolean(dto.auto_fix);

    // Before state: All invoices
    const beforeInvoices = await this.dataSource.query(`
      SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status,
             dbo.fn_calculate_parts_total(id) AS calculated_parts_total,
             (labor_fee + dbo.fn_calculate_parts_total(id) - discount_amount) AS formula_expected_total
      FROM invoices
      ORDER BY id ASC
    `);

    // Execute stored procedure containing cursor
    const callSql = `EXEC dbo.sp_audit_invoices @auto_fix = @0;`;
    const resultRows = await this.dataSource.query(callSql, [autoFix ? 1 : 0]);
    const summary = resultRows?.[0] || { discrepancies_found: 0, was_auto_fixed: autoFix ? 1 : 0 };

    // After state: All invoices
    const afterInvoices = await this.dataSource.query(`
      SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status,
             dbo.fn_calculate_parts_total(id) AS calculated_parts_total,
             (labor_fee + dbo.fn_calculate_parts_total(id) - discount_amount) AS formula_expected_total
      FROM invoices
      ORDER BY id ASC
    `);

    return {
      procedure: 'dbo.sp_audit_invoices',
      cursorUsed: 'cur_invoices LOCAL FAST_FORWARD',
      result: {
        discrepancies_found: Number(summary.discrepancies_found),
        was_auto_fixed: Boolean(summary.was_auto_fixed),
      },
      before: beforeInvoices,
      after: afterInvoices,
    };
  }

  /**
   * 2. sp_alert_delayed_tickets (Cursor)
   */
  async executeAlertDelayedTickets(dto: { delay_days?: number }) {
    const delayDays = dto.delay_days ?? 7;

    // Before state: Active non-completed tickets
    const beforeTickets = await this.dataSource.query(
      `SELECT t.id, t.received_at, DATEDIFF(DAY, t.received_at, GETDATE()) AS days_elapsed,
              t.status, d.device_name, c.full_name AS customer_name
       FROM tickets t
       JOIN devices d ON d.id = t.device_id
       JOIN customers c ON c.id = d.customer_id
       WHERE t.status NOT IN ('completed', 'delivered', 'cancelled')
       ORDER BY t.received_at ASC`,
    );

    // Execute stored procedure containing cursor
    const callSql = `EXEC dbo.sp_alert_delayed_tickets @delay_days = @0;`;
    const delayedTickets = await this.dataSource.query(callSql, [delayDays]);

    return {
      procedure: 'dbo.sp_alert_delayed_tickets',
      cursorUsed: 'cur_delayed_tickets LOCAL FAST_FORWARD',
      delayDays,
      totalOverdueFound: delayedTickets.length,
      before: beforeTickets,
      after: delayedTickets,
    };
  }
}

