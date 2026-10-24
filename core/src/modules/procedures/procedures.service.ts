import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

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

@Injectable()
export class ProceduresService {
  private readonly logger = new Logger(ProceduresService.name);

  constructor(private readonly dataSource: DataSource) {}

  getCatalog(): ProcedureCatalogItem[] {
    return [
      {
        id: 'sp_receive_device',
        name: 'Receive Device & Create Ticket',
        sqlName: 'dbo.sp_receive_device',
        category: 'Reception',
        description:
          'Receives a customer device, auto-detects warranty validity, and creates a repair ticket in "received" status.',
        parameters: [
          { name: 'device_id', type: 'number', required: true, description: 'ID of the device to receive' },
          { name: 'receptionist_id', type: 'number', required: true, description: 'ID of employee (receptionist or manager)' },
          { name: 'issue_description', type: 'string', required: true, description: 'Customer description of the malfunction' },
          { name: 'initial_condition', type: 'string', required: false, description: 'Physical condition upon receipt' },
          { name: 'accessories', type: 'string', required: false, description: 'Accessories included (charger, cable, etc.)' },
          {
            name: 'ticket_type',
            type: 'select',
            required: false,
            defaultValue: 'repair',
            options: ['repair', 'warranty', 're_repair'],
            description: 'Ticket type classification',
          },
        ],
      },
      {
        id: 'sp_process_ticket',
        name: 'Process Ticket & Assign Technician',
        sqlName: 'dbo.sp_process_ticket',
        category: 'Technician Operations',
        description:
          'Advances ticket workflow, assigns technician, documents fault causes and repair solution.',
        parameters: [
          { name: 'ticket_id', type: 'number', required: true, description: 'ID of the ticket to process' },
          {
            name: 'status',
            type: 'select',
            required: true,
            defaultValue: 'inspecting',
            options: ['received', 'inspecting', 'waiting_for_parts', 'repairing', 'completed', 'delivered', 'cancelled'],
            description: 'New ticket status',
          },
          { name: 'technician_id', type: 'number', required: false, description: 'ID of assigned technician' },
          { name: 'fault_cause', type: 'string', required: false, description: 'Diagnosed fault root cause' },
          { name: 'repair_solution', type: 'string', required: false, description: 'Solution or service action taken' },
          { name: 'estimated_cost', type: 'number', required: false, defaultValue: 0, description: 'Estimated cost' },
        ],
      },
      {
        id: 'sp_create_invoice',
        name: 'Create Ticket Invoice',
        sqlName: 'dbo.sp_create_invoice',
        category: 'Billing',
        description:
          'Creates an unpaid invoice for a ticket, with 100% labor discount automatically applied if ticket is warranty or re_repair.',
        parameters: [
          { name: 'ticket_id', type: 'number', required: true, description: 'ID of the ticket needing an invoice' },
          { name: 'labor_fee', type: 'number', required: false, defaultValue: 100, description: 'Base labor charge amount' },
        ],
      },
      {
        id: 'sp_add_invoice_part',
        name: 'Add Spare Part to Invoice',
        sqlName: 'dbo.sp_add_invoice_part',
        category: 'Billing & Inventory',
        description:
          'Adds a replacement spare part to an invoice, verifying inventory stock and recalculating invoice total.',
        parameters: [
          { name: 'invoice_id', type: 'number', required: true, description: 'ID of the target unpaid invoice' },
          { name: 'part_id', type: 'number', required: true, description: 'ID of the spare part from inventory' },
          { name: 'quantity', type: 'number', required: true, defaultValue: 1, description: 'Quantity required' },
        ],
      },
      {
        id: 'sp_checkout_invoice',
        name: 'Checkout Invoice & Deliver Ticket',
        sqlName: 'dbo.sp_checkout_invoice',
        category: 'Cashier & Delivery',
        description:
          'Marks invoice as paid and transitions associated completed ticket to "delivered" status.',
        parameters: [
          { name: 'invoice_id', type: 'number', required: true, description: 'ID of completed invoice to checkout' },
          {
            name: 'payment_method',
            type: 'select',
            required: false,
            defaultValue: 'cash',
            options: ['cash', 'bank_transfer', 'credit_card'],
            description: 'Payment method chosen by customer',
          },
        ],
      },
    ];
  }

  async getSampleData() {
    const devices = await this.dataSource.query(`SELECT TOP 5 id, device_name, serial_number, is_under_warranty FROM devices ORDER BY id ASC`);
    const receptionists = await this.dataSource.query(`SELECT TOP 5 id, full_name, role FROM employees WHERE role IN ('receptionist', 'manager') AND is_active = 1`);
    const technicians = await this.dataSource.query(`SELECT TOP 5 id, full_name, role FROM employees WHERE role = 'technician' AND is_active = 1`);
    const tickets = await this.dataSource.query(`SELECT TOP 5 id, device_id, status, ticket_type, technician_id FROM tickets ORDER BY id DESC`);
    const unpaidInvoices = await this.dataSource.query(`SELECT TOP 5 id, ticket_id, status, labor_fee, total_amount FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
    const completedTickets = await this.dataSource.query(`SELECT TOP 5 t.id AS ticket_id, i.id AS invoice_id, t.status AS ticket_status, i.status AS invoice_status FROM tickets t JOIN invoices i ON i.ticket_id = t.id WHERE t.status = 'completed' AND i.status = 'unpaid'`);
    const parts = await this.dataSource.query(`SELECT TOP 5 id, part_name, stock_quantity, price FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`);

    return {
      devices,
      receptionists,
      technicians,
      tickets,
      unpaidInvoices,
      completedTickets,
      parts,
    };
  }

  /**
   * 1. sp_receive_device
   */
  async executeReceiveDevice(dto: {
    device_id: number;
    receptionist_id: number;
    issue_description: string;
    initial_condition?: string;
    accessories?: string;
    ticket_type?: string;
  }) {
    // Before data: Device and its existing tickets
    const beforeDevice = await this.dataSource.query(
      `SELECT * FROM devices WHERE id = @0`,
      [dto.device_id],
    );
    const beforeTickets = await this.dataSource.query(
      `SELECT TOP 5 * FROM tickets WHERE device_id = @0 ORDER BY id DESC`,
      [dto.device_id],
    );

    // Call stored procedure with OUTPUT parameter
    const callSql = `
      DECLARE @out_ticket_id INT;
      EXEC dbo.sp_receive_device
        @device_id = @0,
        @receptionist_id = @1,
        @issue_description = @2,
        @initial_condition = @3,
        @accessories = @4,
        @ticket_type = @5,
        @ticket_id = @out_ticket_id OUTPUT;
      SELECT @out_ticket_id AS new_ticket_id;
    `;

    const result = await this.dataSource.query(callSql, [
      dto.device_id,
      dto.receptionist_id,
      dto.issue_description || 'Standard repair request',
      dto.initial_condition || null,
      dto.accessories || null,
      dto.ticket_type || 'repair',
    ]);

    const newTicketId = result?.[0]?.new_ticket_id;

    // After data
    const afterTicket = newTicketId
      ? await this.dataSource.query(`SELECT * FROM tickets WHERE id = @0`, [newTicketId])
      : [];
    const afterHistory = newTicketId
      ? await this.dataSource.query(
          `SELECT * FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
          [newTicketId],
        )
      : [];
    const afterTickets = await this.dataSource.query(
      `SELECT TOP 5 * FROM tickets WHERE device_id = @0 ORDER BY id DESC`,
      [dto.device_id],
    );

    return {
      procedure: 'dbo.sp_receive_device',
      newTicketId,
      before: {
        device: beforeDevice,
        recentTickets: beforeTickets,
      },
      after: {
        createdTicket: afterTicket,
        auditHistory: afterHistory,
        recentTickets: afterTickets,
      },
    };
  }

  /**
   * 2. sp_process_ticket
   */
  async executeProcessTicket(dto: {
    ticket_id: number;
    status: string;
    technician_id?: number;
    fault_cause?: string;
    repair_solution?: string;
    estimated_cost?: number;
  }) {
    // Before data
    const beforeTicket = await this.dataSource.query(
      `SELECT * FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    if (!beforeTicket || beforeTicket.length === 0) {
      throw new NotFoundException(`Ticket #${dto.ticket_id} not found`);
    }

    const beforeHistory = await this.dataSource.query(
      `SELECT * FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [dto.ticket_id],
    );

    // Call procedure
    const callSql = `
      EXEC dbo.sp_process_ticket
        @ticket_id = @0,
        @status = @1,
        @technician_id = @2,
        @fault_cause = @3,
        @repair_solution = @4,
        @estimated_cost = @5;
    `;

    await this.dataSource.query(callSql, [
      dto.ticket_id,
      dto.status,
      dto.technician_id || null,
      dto.fault_cause || null,
      dto.repair_solution || null,
      dto.estimated_cost ?? null,
    ]);

    // After data
    const afterTicket = await this.dataSource.query(
      `SELECT * FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    const afterHistory = await this.dataSource.query(
      `SELECT * FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [dto.ticket_id],
    );

    return {
      procedure: 'dbo.sp_process_ticket',
      ticketId: dto.ticket_id,
      before: {
        ticket: beforeTicket,
        statusHistory: beforeHistory,
      },
      after: {
        ticket: afterTicket,
        statusHistory: afterHistory,
      },
    };
  }

  /**
   * 3. sp_create_invoice
   */
  async executeCreateInvoice(dto: { ticket_id: number; labor_fee?: number }) {
    const beforeTicket = await this.dataSource.query(
      `SELECT * FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    if (!beforeTicket || beforeTicket.length === 0) {
      throw new NotFoundException(`Ticket #${dto.ticket_id} not found`);
    }

    const beforeInvoices = await this.dataSource.query(
      `SELECT * FROM invoices WHERE ticket_id = @0`,
      [dto.ticket_id],
    );

    const callSql = `
      DECLARE @out_invoice_id INT;
      EXEC dbo.sp_create_invoice
        @ticket_id = @0,
        @labor_fee = @1,
        @invoice_id = @out_invoice_id OUTPUT;
      SELECT @out_invoice_id AS new_invoice_id;
    `;

    const result = await this.dataSource.query(callSql, [
      dto.ticket_id,
      dto.labor_fee ?? 0,
    ]);

    const newInvoiceId = result?.[0]?.new_invoice_id;

    const afterInvoices = await this.dataSource.query(
      `SELECT * FROM invoices WHERE ticket_id = @0`,
      [dto.ticket_id],
    );

    return {
      procedure: 'dbo.sp_create_invoice',
      newInvoiceId,
      before: {
        ticket: beforeTicket,
        invoices: beforeInvoices,
      },
      after: {
        invoices: afterInvoices,
      },
    };
  }

  /**
   * 4. sp_add_invoice_part
   */
  async executeAddInvoicePart(dto: {
    invoice_id: number;
    part_id: number;
    quantity: number;
  }) {
    const beforeInvoice = await this.dataSource.query(
      `SELECT * FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    if (!beforeInvoice || beforeInvoice.length === 0) {
      throw new NotFoundException(`Invoice #${dto.invoice_id} not found`);
    }

    const beforePart = await this.dataSource.query(
      `SELECT * FROM parts WHERE id = @0`,
      [dto.part_id],
    );
    const beforeItems = await this.dataSource.query(
      `SELECT * FROM invoice_items WHERE invoice_id = @0`,
      [dto.invoice_id],
    );

    const callSql = `
      EXEC dbo.sp_add_invoice_part
        @invoice_id = @0,
        @part_id = @1,
        @quantity = @2;
    `;

    await this.dataSource.query(callSql, [
      dto.invoice_id,
      dto.part_id,
      dto.quantity,
    ]);

    const afterInvoice = await this.dataSource.query(
      `SELECT * FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    const afterPart = await this.dataSource.query(
      `SELECT * FROM parts WHERE id = @0`,
      [dto.part_id],
    );
    const afterItems = await this.dataSource.query(
      `SELECT * FROM invoice_items WHERE invoice_id = @0`,
      [dto.invoice_id],
    );

    return {
      procedure: 'dbo.sp_add_invoice_part',
      before: {
        invoice: beforeInvoice,
        part: beforePart,
        items: beforeItems,
      },
      after: {
        invoice: afterInvoice,
        part: afterPart,
        items: afterItems,
      },
    };
  }

  /**
   * 5. sp_checkout_invoice
   */
  async executeCheckoutInvoice(dto: {
    invoice_id: number;
    payment_method?: string;
  }) {
    const beforeInvoice = await this.dataSource.query(
      `SELECT * FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    if (!beforeInvoice || beforeInvoice.length === 0) {
      throw new NotFoundException(`Invoice #${dto.invoice_id} not found`);
    }

    const beforeTicket = await this.dataSource.query(
      `SELECT t.* FROM tickets t JOIN invoices i ON i.ticket_id = t.id WHERE i.id = @0`,
      [dto.invoice_id],
    );

    const callSql = `
      EXEC dbo.sp_checkout_invoice
        @invoice_id = @0,
        @payment_method = @1;
    `;

    await this.dataSource.query(callSql, [
      dto.invoice_id,
      dto.payment_method || 'cash',
    ]);

    const afterInvoice = await this.dataSource.query(
      `SELECT * FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    const afterTicket = await this.dataSource.query(
      `SELECT t.* FROM tickets t JOIN invoices i ON i.ticket_id = t.id WHERE i.id = @0`,
      [dto.invoice_id],
    );

    return {
      procedure: 'dbo.sp_checkout_invoice',
      before: {
        invoice: beforeInvoice,
        ticket: beforeTicket,
      },
      after: {
        invoice: afterInvoice,
        ticket: afterTicket,
      },
    };
  }
}

