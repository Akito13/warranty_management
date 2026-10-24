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
        name: 'Tiếp Nhận Thiết Bị & Tạo Phiếu Sửa Chữa',
        sqlName: 'dbo.sp_receive_device',
        category: 'Tiếp Nhận POS',
        description:
          'Tiếp nhận thiết bị khách hàng mang đến, tự động kiểm tra thời hạn bảo hành bằng hàm fn_is_device_under_warranty để gắn loại phiếu (warranty/repair), và tạo mới phiếu ở trạng thái "received".',
        parameters: [
          { name: 'device_id', type: 'number', required: true, description: 'ID thiết bị khách hàng cần tiếp nhận' },
          { name: 'receptionist_id', type: 'number', required: true, description: 'ID nhân viên tiếp nhận (lễ tân hoặc quản lý)' },
          { name: 'issue_description', type: 'string', required: true, description: 'Mô tả hiện tượng lỗi từ khách hàng' },
          { name: 'initial_condition', type: 'string', required: false, description: 'Tình trạng ngoại quan khi tiếp nhận' },
          { name: 'accessories', type: 'string', required: false, description: 'Phụ kiện kèm theo (sạc, cáp, hộp...)' },
          {
            name: 'ticket_type',
            type: 'select',
            required: false,
            defaultValue: 'repair',
            options: ['repair', 'warranty', 're_repair'],
            description: 'Phân loại phiếu sửa chữa / bảo hành',
          },
        ],
      },
      {
        id: 'sp_process_ticket',
        name: 'Xử Lý Phiếu & Phân Công Kỹ Thuật Viên',
        sqlName: 'dbo.sp_process_ticket',
        category: 'Kỹ Thuật Viên',
        description:
          'Chuyển bước quy trình xử lý phiếu, phân công kỹ thuật viên phụ trách, cập nhật nguyên nhân lỗi, giải pháp sửa chữa và chi phí dự kiến.',
        parameters: [
          { name: 'ticket_id', type: 'number', required: true, description: 'ID phiếu sửa chữa cần xử lý' },
          {
            name: 'status',
            type: 'select',
            required: true,
            defaultValue: 'inspecting',
            options: ['received', 'inspecting', 'waiting_for_parts', 'repairing', 'completed', 'delivered', 'cancelled'],
            description: 'Trạng thái mới của phiếu',
          },
          { name: 'technician_id', type: 'number', required: false, description: 'ID kỹ thuật viên được phân công' },
          { name: 'fault_cause', type: 'string', required: false, description: 'Nguyên nhân hư hỏng sau khi chẩn đoán' },
          { name: 'repair_solution', type: 'string', required: false, description: 'Phương án xử lý kỹ thuật / sửa chữa' },
          { name: 'estimated_cost', type: 'number', required: false, defaultValue: 0, description: 'Chi phí sửa chữa dự kiến' },
        ],
      },
      {
        id: 'sp_create_invoice',
        name: 'Lập Hóa Đơn Cho Phiếu Sửa Chữa',
        sqlName: 'dbo.sp_create_invoice',
        category: 'Thu Ngân & Kế Toán',
        description:
          'Tạo hóa đơn ở trạng thái chưa thanh toán (unpaid). Nếu phiếu thuộc diện bảo hành (warranty) hoặc sửa lại (re_repair), tự động chiết khấu 100% tiền công (labor_fee).',
        parameters: [
          { name: 'ticket_id', type: 'number', required: true, description: 'ID phiếu sửa chữa cần lập hóa đơn' },
          { name: 'labor_fee', type: 'number', required: false, defaultValue: 100, description: 'Tiền công sửa chữa ban đầu ($)' },
        ],
      },
      {
        id: 'sp_add_invoice_part',
        name: 'Thêm Linh Kiện Vào Hóa Đơn',
        sqlName: 'dbo.sp_add_invoice_part',
        category: 'Kho & Hóa Đơn',
        description:
          'Thêm linh kiện thay thế vào hóa đơn, kiểm tra tính khả dụng trong kho parts. Nếu linh kiện đã có thì tự động cộng dồn số lượng và cập nhật tổng tiền hóa đơn.',
        parameters: [
          { name: 'invoice_id', type: 'number', required: true, description: 'ID hóa đơn chưa thanh toán' },
          { name: 'part_id', type: 'number', required: true, description: 'ID linh kiện từ kho parts' },
          { name: 'quantity', type: 'number', required: true, defaultValue: 1, description: 'Số lượng cần sử dụng' },
        ],
      },
      {
        id: 'sp_checkout_invoice',
        name: 'Thanh Toán Hóa Đơn & Bàn Giao Thiết Bị',
        sqlName: 'dbo.sp_checkout_invoice',
        category: 'Thu Ngân & Bàn Giao',
        description:
          'Chuyển trạng thái hóa đơn sang đã thanh toán (paid), ghi nhận hình thức thanh toán, thời điểm thanh toán và tự động cập nhật phiếu sửa chữa sang đã bàn giao ("delivered").',
        parameters: [
          { name: 'invoice_id', type: 'number', required: true, description: 'ID hóa đơn cần thanh toán' },
          {
            name: 'payment_method',
            type: 'select',
            required: false,
            defaultValue: 'cash',
            options: ['cash', 'bank_transfer', 'credit_card'],
            description: 'Phương thức thanh toán của khách hàng',
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
    const beforeDevice = await this.dataSource.query(
      `SELECT * FROM devices WHERE id = @0`,
      [dto.device_id],
    );
    const beforeTickets = await this.dataSource.query(
      `SELECT TOP 5 * FROM tickets WHERE device_id = @0 ORDER BY id DESC`,
      [dto.device_id],
    );

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
      dto.issue_description || 'Yêu cầu tiếp nhận sửa chữa thông thường',
      dto.initial_condition || null,
      dto.accessories || null,
      dto.ticket_type || 'repair',
    ]);

    const newTicketId = result?.[0]?.new_ticket_id;

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
    const beforeTicket = await this.dataSource.query(
      `SELECT * FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    if (!beforeTicket || beforeTicket.length === 0) {
      throw new NotFoundException(`Không tìm thấy phiếu sửa chữa #${dto.ticket_id}`);
    }

    const beforeHistory = await this.dataSource.query(
      `SELECT * FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [dto.ticket_id],
    );

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
      throw new NotFoundException(`Không tìm thấy phiếu #${dto.ticket_id}`);
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
      throw new NotFoundException(`Không tìm thấy hóa đơn #${dto.invoice_id}`);
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
      throw new NotFoundException(`Không tìm thấy hóa đơn #${dto.invoice_id}`);
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
