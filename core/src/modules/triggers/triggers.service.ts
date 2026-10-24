import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

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

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(private readonly dataSource: DataSource) {}

  getCatalog(): TriggerCatalogItem[] {
    return [
      {
        id: 'trg_invoice_items_stock',
        name: 'trg_invoice_items_stock',
        table: 'invoice_items',
        timing: 'AFTER INSERT, UPDATE, DELETE',
        type: 'guard',
        description:
          'Verifies spare part stock availability in inventory upon invoice item change. Automatically deducts inventory stock, or rolls back with error 50001 if stock is insufficient.',
        scenarios: [
          {
            id: 'stock_exceeded_fail',
            title: 'Test Insufficient Stock Guard (Trigger Stops Action)',
            description: 'Attempts to add a part to an invoice with quantity greater than available inventory stock.',
            expectedOutcome: 'STOPPED',
            actionDescription: 'INSERT INTO invoice_items with quantity > parts.stock_quantity',
          },
          {
            id: 'stock_deduction_success',
            title: 'Test Stock Deduction (Trigger Modifies Inventory)',
            description: 'Adds a part to an invoice with valid quantity; trigger automatically decrements stock_quantity in parts.',
            expectedOutcome: 'MODIFIED',
            actionDescription: 'INSERT INTO invoice_items with valid quantity; parts.stock_quantity reduced',
          },
        ],
      },
      {
        id: 'trg_invoices_total_amount',
        name: 'trg_invoices_total_amount',
        table: 'invoice_items',
        timing: 'AFTER INSERT, UPDATE, DELETE',
        type: 'cascade',
        description:
          'Automatically recalculates invoices.total_amount and parts discount when items are added, modified, or removed from an unpaid invoice.',
        scenarios: [
          {
            id: 'auto_calc_total',
            title: 'Test Auto-Calculate Invoice Total (Trigger Modifies Invoice)',
            description: 'Inserts a part item into an unpaid invoice; trigger immediately updates invoices.total_amount.',
            expectedOutcome: 'MODIFIED',
            actionDescription: 'INSERT INTO invoice_items -> invoices.total_amount recalculated',
          },
        ],
      },
      {
        id: 'trg_invoices_labor_update',
        name: 'trg_invoices_labor_update',
        table: 'invoices',
        timing: 'AFTER INSERT, UPDATE',
        type: 'cascade',
        description:
          'Automatically updates total_amount when labor_fee or discount_amount on an unpaid invoice is updated.',
        scenarios: [
          {
            id: 'update_labor_fee',
            title: 'Test Labor Fee Update (Trigger Modifies Total Amount)',
            description: 'Updates labor_fee on an unpaid invoice; trigger recalculates total_amount taking into account parts and discounts.',
            expectedOutcome: 'MODIFIED',
            actionDescription: 'UPDATE invoices SET labor_fee = labor_fee + 50 -> invoices.total_amount recalculated',
          },
        ],
      },
      {
        id: 'trg_tickets_workflow_guard',
        name: 'trg_tickets_workflow_guard',
        table: 'tickets',
        timing: 'AFTER INSERT, UPDATE',
        type: 'guard',
        description:
          'Enforces workflow state machine rules: forbids advancing to repairing/completed without an assigned technician, blocks invalid status transitions, and automatically timestamps completed_at.',
        scenarios: [
          {
            id: 'guard_missing_technician',
            title: 'Test Missing Technician Guard (Trigger Stops Action)',
            description: 'Attempts to change status to "repairing" or "completed" without assigning a technician (technician_id = NULL).',
            expectedOutcome: 'STOPPED',
            actionDescription: 'UPDATE tickets SET status = "repairing", technician_id = NULL',
          },
          {
            id: 'guard_invalid_transition',
            title: 'Test Invalid Transition Guard (Trigger Stops Action)',
            description: 'Attempts to transition a delivered ticket back to inspecting or an illegal linear state leap.',
            expectedOutcome: 'STOPPED',
            actionDescription: 'UPDATE tickets SET status = "inspecting" WHERE status = "delivered"',
          },
          {
            id: 'auto_completed_timestamp',
            title: 'Test Auto Completed Timestamp (Trigger Modifies Ticket)',
            description: 'Transitions an in-progress ticket to "completed" with a valid technician; trigger automatically populates completed_at.',
            expectedOutcome: 'MODIFIED',
            actionDescription: 'UPDATE tickets SET status = "completed" -> tickets.completed_at auto-populated',
          },
        ],
      },
      {
        id: 'trg_tickets_audit_history',
        name: 'trg_tickets_audit_history',
        table: 'tickets',
        timing: 'AFTER INSERT, UPDATE',
        type: 'audit',
        description:
          'Audit trail trigger: whenever ticket status is updated, automatically inserts a tracking record into ticket_status_history with old_status and new_status.',
        scenarios: [
          {
            id: 'audit_status_change',
            title: 'Test Status Audit Trail (Trigger Inserts Audit Record)',
            description: 'Changes a ticket status from received to inspecting; trigger automatically inserts an audit row into ticket_status_history.',
            expectedOutcome: 'MODIFIED',
            actionDescription: 'UPDATE tickets SET status = "inspecting" -> INSERT INTO ticket_status_history',
          },
        ],
      },
      {
        id: 'trg_invoice_items_freeze_paid',
        name: 'trg_invoice_items_freeze_paid',
        table: 'invoice_items',
        timing: 'AFTER INSERT, UPDATE, DELETE (First Order)',
        type: 'guard',
        description:
          'Financial Immutability: Prohibits inserting, updating, or deleting spare parts on an invoice that has status = "paid".',
        scenarios: [
          {
            id: 'paid_items_freeze_fail',
            title: 'Test Paid Invoice Items Immutability (Trigger Stops Action)',
            description: 'Attempts to add or delete a spare part on an already paid invoice.',
            expectedOutcome: 'STOPPED',
            actionDescription: 'INSERT INTO invoice_items WHERE invoice.status = "paid"',
          },
        ],
      },
      {
        id: 'trg_invoices_freeze_paid_amounts',
        name: 'trg_invoices_freeze_paid_amounts',
        table: 'invoices',
        timing: 'AFTER UPDATE',
        type: 'guard',
        description:
          'Financial Immutability: Prohibits any alteration to labor_fee, discount_amount, total_amount, or status on an invoice that is already paid.',
        scenarios: [
          {
            id: 'paid_financials_freeze_fail',
            title: 'Test Paid Invoice Financial Immutability (Trigger Stops Action)',
            description: 'Attempts to alter the labor_fee or total_amount on an already paid invoice.',
            expectedOutcome: 'STOPPED',
            actionDescription: 'UPDATE invoices SET labor_fee = labor_fee + 100 WHERE status = "paid"',
          },
        ],
      },
    ];
  }

  async getSampleData() {
    const parts = await this.dataSource.query(`SELECT TOP 5 id, part_name, price, stock_quantity FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`);
    const unpaidInvoices = await this.dataSource.query(`SELECT TOP 5 id, ticket_id, labor_fee, discount_amount, total_amount, status FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
    const paidInvoices = await this.dataSource.query(`SELECT TOP 5 id, ticket_id, labor_fee, discount_amount, total_amount, status, payment_method FROM invoices WHERE status = 'paid' ORDER BY id DESC`);
    const tickets = await this.dataSource.query(`SELECT TOP 5 id, device_id, technician_id, status, ticket_type, completed_at FROM tickets ORDER BY id DESC`);
    const technicians = await this.dataSource.query(`SELECT TOP 5 id, full_name FROM employees WHERE role = 'technician' AND is_active = 1`);

    return {
      parts,
      unpaidInvoices,
      paidInvoices,
      tickets,
      technicians,
    };
  }

  /**
   * Main entry point to test trigger events.
   */
  async executeTriggerScenario(dto: {
    trigger_id: string;
    scenario_id: string;
    params?: Record<string, any>;
  }) {
    const { trigger_id, scenario_id, params = {} } = dto;

    switch (trigger_id) {
      case 'trg_invoice_items_stock':
        return this.testInvoiceItemsStock(scenario_id, params);

      case 'trg_invoices_total_amount':
        return this.testInvoicesTotalAmount(scenario_id, params);

      case 'trg_invoices_labor_update':
        return this.testInvoicesLaborUpdate(scenario_id, params);

      case 'trg_tickets_workflow_guard':
        return this.testTicketsWorkflowGuard(scenario_id, params);

      case 'trg_tickets_audit_history':
        return this.testTicketsAuditHistory(scenario_id, params);

      case 'trg_invoice_items_freeze_paid':
        return this.testInvoiceItemsFreezePaid(scenario_id, params);

      case 'trg_invoices_freeze_paid_amounts':
        return this.testInvoicesFreezePaidAmounts(scenario_id, params);

      default:
        throw new BadRequestException(`Unknown trigger: ${trigger_id}`);
    }
  }

  /**
   * 1. trg_invoice_items_stock
   */
  private async testInvoiceItemsStock(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_invoice_items_stock';

    // Pick a part
    let partId = Number(params.part_id);
    if (!partId) {
      const p = await this.dataSource.query(`SELECT TOP 1 id, stock_quantity FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`);
      partId = p?.[0]?.id || 1;
    }

    // Pick an unpaid invoice
    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
      invoiceId = inv?.[0]?.id || 1;
    }

    // Before data: Part row
    const beforePart = await this.dataSource.query(`SELECT id, part_name, unit, price, stock_quantity FROM parts WHERE id = @0`, [partId]);
    const currentStock = beforePart?.[0]?.stock_quantity ?? 10;

    if (scenarioId === 'stock_exceeded_fail') {
      // Exceed stock
      const requestedQuantity = currentStock + 999;
      try {
        await this.dataSource.query(
          `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, @2, @3)`,
          [invoiceId, partId, requestedQuantity, beforePart?.[0]?.price || 50],
        );
        return {
          success: true,
          stopped: false,
          triggerName,
          before: beforePart,
          message: 'Operation succeeded unexpectedly without trigger intervention.',
        };
      } catch (err: any) {
        const reason = err.message || 'Insufficient spare part inventory stock.';
        return {
          success: false,
          stopped: true,
          triggerName,
          reason,
          errorCode: err.number || 50001,
          before: beforePart,
          message: `${triggerName} stopped this action due to: ${reason}`,
        };
      }
    } else {
      // Valid stock deduction
      const deductQuantity = 1;
      try {
        await this.dataSource.query(
          `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, @2, @3)`,
          [invoiceId, partId, deductQuantity, beforePart?.[0]?.price || 50],
        );

        const afterPart = await this.dataSource.query(
          `SELECT id, part_name, unit, price, stock_quantity FROM parts WHERE id = @0`,
          [partId],
        );
        const afterItem = await this.dataSource.query(
          `SELECT TOP 1 id, invoice_id, part_id, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = @0 AND part_id = @1 ORDER BY id DESC`,
          [invoiceId, partId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          before: beforePart,
          after: afterPart,
          relatedItems: afterItem,
          message: `Trigger ${triggerName} executed successfully: Part stock reduced from ${currentStock} to ${afterPart?.[0]?.stock_quantity}.`,
        };
      } catch (err: any) {
        return {
          success: false,
          stopped: true,
          triggerName,
          reason: err.message,
          before: beforePart,
          message: `${triggerName} stopped this action due to: ${err.message}`,
        };
      }
    }
  }

  /**
   * 2. trg_invoices_total_amount
   */
  private async testInvoicesTotalAmount(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_invoices_total_amount';

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
      invoiceId = inv?.[0]?.id || 1;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount FROM invoices WHERE id = @0`,
      [invoiceId],
    );

    const part = await this.dataSource.query(`SELECT TOP 1 id, price, stock_quantity FROM parts WHERE stock_quantity > 0`);
    const partId = part?.[0]?.id || 1;
    const unitPrice = part?.[0]?.price || 100;

    try {
      await this.dataSource.query(
        `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, 1, @2)`,
        [invoiceId, partId, unitPrice],
      );

      const afterInvoice = await this.dataSource.query(
        `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount FROM invoices WHERE id = @0`,
        [invoiceId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        before: beforeInvoice,
        after: afterInvoice,
        message: `Trigger ${triggerName} recalculated total_amount: Before = $${beforeInvoice?.[0]?.total_amount}, After = $${afterInvoice?.[0]?.total_amount}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        stopped: true,
        triggerName,
        reason: err.message,
        before: beforeInvoice,
        message: `${triggerName} stopped this action due to: ${err.message}`,
      };
    }
  }

  /**
   * 3. trg_invoices_labor_update
   */
  private async testInvoicesLaborUpdate(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_invoices_labor_update';

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
      invoiceId = inv?.[0]?.id || 1;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount FROM invoices WHERE id = @0`,
      [invoiceId],
    );

    const addFee = Number(params.labor_delta) || 50;

    try {
      await this.dataSource.query(
        `UPDATE invoices SET labor_fee = labor_fee + @0 WHERE id = @1`,
        [addFee, invoiceId],
      );

      const afterInvoice = await this.dataSource.query(
        `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount FROM invoices WHERE id = @0`,
        [invoiceId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        before: beforeInvoice,
        after: afterInvoice,
        message: `Trigger ${triggerName} recalculated total: Labor fee changed from $${beforeInvoice?.[0]?.labor_fee} to $${afterInvoice?.[0]?.labor_fee}, new total = $${afterInvoice?.[0]?.total_amount}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        stopped: true,
        triggerName,
        reason: err.message,
        before: beforeInvoice,
        message: `${triggerName} stopped this action due to: ${err.message}`,
      };
    }
  }

  /**
   * 4. trg_tickets_workflow_guard
   */
  private async testTicketsWorkflowGuard(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_tickets_workflow_guard';

    if (scenarioId === 'guard_missing_technician') {
      let ticketId = Number(params.ticket_id);
      if (!ticketId) {
        const t = await this.dataSource.query(`SELECT TOP 1 id FROM tickets WHERE status = 'received' ORDER BY id DESC`);
        ticketId = t?.[0]?.id || 1;
      }

      const beforeTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, received_at FROM tickets WHERE id = @0`,
        [ticketId],
      );

      try {
        await this.dataSource.query(
          `UPDATE tickets SET status = 'repairing', technician_id = NULL WHERE id = @0`,
          [ticketId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          before: beforeTicket,
          message: 'Operation succeeded unexpectedly without trigger enforcement.',
        };
      } catch (err: any) {
        const reason = err.message || 'A technician must be assigned before advancing to repairing or completed.';
        return {
          success: false,
          stopped: true,
          triggerName,
          reason,
          errorCode: err.number || 50003,
          before: beforeTicket,
          message: `${triggerName} stopped this action due to: ${reason}`,
        };
      }
    } else if (scenarioId === 'guard_invalid_transition') {
      // Find a delivered ticket or force an illegal jump
      const del = await this.dataSource.query(`SELECT TOP 1 id FROM tickets WHERE status = 'delivered' ORDER BY id DESC`);
      const ticketId = del?.[0]?.id || 1;

      const beforeTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, completed_at FROM tickets WHERE id = @0`,
        [ticketId],
      );

      try {
        await this.dataSource.query(
          `UPDATE tickets SET status = 'inspecting' WHERE id = @0`,
          [ticketId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          before: beforeTicket,
          message: 'Operation succeeded unexpectedly without trigger enforcement.',
        };
      } catch (err: any) {
        const reason = err.message || 'Invalid ticket status transition.';
        return {
          success: false,
          stopped: true,
          triggerName,
          reason,
          errorCode: err.number || 50004,
          before: beforeTicket,
          message: `${triggerName} stopped this action due to: ${reason}`,
        };
      }
    } else {
      // auto_completed_timestamp
      const t = await this.dataSource.query(
        `SELECT TOP 1 id, status, technician_id, completed_at FROM tickets WHERE status NOT IN ('completed', 'delivered') AND technician_id IS NOT NULL ORDER BY id DESC`,
      );
      const ticketId = t?.[0]?.id || 1;
      let techId = t?.[0]?.technician_id;
      if (!techId) {
        const tech = await this.dataSource.query(`SELECT TOP 1 id FROM employees WHERE role = 'technician'`);
        techId = tech?.[0]?.id || 1;
      }

      const beforeTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, completed_at FROM tickets WHERE id = @0`,
        [ticketId],
      );

      try {
        await this.dataSource.query(
          `UPDATE tickets SET status = 'completed', technician_id = @0 WHERE id = @1`,
          [techId, ticketId],
        );

        const afterTicket = await this.dataSource.query(
          `SELECT id, status, technician_id, completed_at FROM tickets WHERE id = @0`,
          [ticketId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          before: beforeTicket,
          after: afterTicket,
          message: `Trigger ${triggerName} automatically set completed_at timestamp: ${afterTicket?.[0]?.completed_at}.`,
        };
      } catch (err: any) {
        return {
          success: false,
          stopped: true,
          triggerName,
          reason: err.message,
          before: beforeTicket,
          message: `${triggerName} stopped this action due to: ${err.message}`,
        };
      }
    }
  }

  /**
   * 5. trg_tickets_audit_history
   */
  private async testTicketsAuditHistory(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_tickets_audit_history';

    let ticketId = Number(params.ticket_id);
    if (!ticketId) {
      const t = await this.dataSource.query(`SELECT TOP 1 id FROM tickets WHERE status = 'received' ORDER BY id DESC`);
      ticketId = t?.[0]?.id || 1;
    }

    const beforeHistory = await this.dataSource.query(
      `SELECT * FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [ticketId],
    );

    try {
      await this.dataSource.query(
        `UPDATE tickets SET status = 'inspecting' WHERE id = @0`,
        [ticketId],
      );

      const afterHistory = await this.dataSource.query(
        `SELECT * FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
        [ticketId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        before: beforeHistory,
        after: afterHistory,
        message: `Trigger ${triggerName} automatically appended audit trail record with new_status = 'inspecting'.`,
      };
    } catch (err: any) {
      return {
        success: false,
        stopped: true,
        triggerName,
        reason: err.message,
        before: beforeHistory,
        message: `${triggerName} stopped this action due to: ${err.message}`,
      };
    }
  }

  /**
   * 6. trg_invoice_items_freeze_paid
   */
  private async testInvoiceItemsFreezePaid(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_invoice_items_freeze_paid';

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'paid' ORDER BY id DESC`);
      invoiceId = inv?.[0]?.id || 1;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, total_amount, payment_method, paid_at FROM invoices WHERE id = @0`,
      [invoiceId],
    );

    const part = await this.dataSource.query(`SELECT TOP 1 id, price FROM parts`);
    const partId = part?.[0]?.id || 1;

    try {
      await this.dataSource.query(
        `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, 1, @2)`,
        [invoiceId, partId, part?.[0]?.price || 50],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        before: beforeInvoice,
        message: 'Operation succeeded unexpectedly without trigger enforcement.',
      };
    } catch (err: any) {
      const reason = err.message || 'Cannot add, modify, or remove spare parts on an already paid invoice.';
      return {
        success: false,
        stopped: true,
        triggerName,
        reason,
        errorCode: err.number || 50035,
        before: beforeInvoice,
        message: `${triggerName} stopped this action due to: ${reason}`,
      };
    }
  }

  /**
   * 7. trg_invoices_freeze_paid_amounts
   */
  private async testInvoicesFreezePaidAmounts(scenarioId: string, params: Record<string, any>) {
    const triggerName = 'trg_invoices_freeze_paid_amounts';

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'paid' ORDER BY id DESC`);
      invoiceId = inv?.[0]?.id || 1;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, paid_at FROM invoices WHERE id = @0`,
      [invoiceId],
    );

    try {
      await this.dataSource.query(
        `UPDATE invoices SET labor_fee = labor_fee + 100 WHERE id = @0`,
        [invoiceId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        before: beforeInvoice,
        message: 'Operation succeeded unexpectedly without trigger enforcement.',
      };
    } catch (err: any) {
      const reason = err.message || 'Financial data of a paid invoice is immutable and cannot be altered or reversed.';
      return {
        success: false,
        stopped: true,
        triggerName,
        reason,
        errorCode: err.number || 50036,
        before: beforeInvoice,
        message: `${triggerName} stopped this action due to: ${reason}`,
      };
    }
  }
}

