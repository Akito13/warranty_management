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

export interface ProcedureTableComparison {
  tableName: string;
  tableTitle: string;
  description?: string;
  highlightColumns?: string[];
  beforeRows: Record<string, any>[];
  afterRows?: Record<string, any>[];
  statusNote?: string;
}

export interface ProcedurePreviewResult {
  exactSql: string;
  targetDesc: string;
  tables: ProcedureTableComparison[];
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
          'Tiếp nhận thiết bị khách hàng mang đến, tự động kiểm tra thời hạn bảo hành bằng hàm fn_is_device_under_warranty để gán loại phiếu (warranty/repair), và tạo mới phiếu ở trạng thái "received".',
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
            defaultValue: 'repairing',
            options: ['received', 'inspecting', 'waiting_for_parts', 'repairing', 'completed', 'delivered', 'cancelled'],
            description: 'Trạng thái mới của phiếu',
          },
          { name: 'technician_id', type: 'number', required: false, description: 'ID kỹ thuật viên được phân công' },
          { name: 'fault_cause', type: 'string', required: false, description: 'Nguyên nhân hư hỏng sau khi chẩn đoán' },
          { name: 'repair_solution', type: 'string', required: false, description: 'Phương án xử lý kỹ thuật / sửa chữa' },
          { name: 'estimated_cost', type: 'number', required: false, defaultValue: 150, description: 'Chi phí sửa chữa dự kiến ($)' },
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
          { name: 'labor_fee', type: 'number', required: false, defaultValue: 120, description: 'Tiền công sửa chữa ban đầu ($)' },
        ],
      },
      {
        id: 'sp_add_invoice_part',
        name: 'Thêm Linh Kiện Vào Hóa Đơn',
        sqlName: 'dbo.sp_add_invoice_part',
        category: 'Kho & Hóa Đơn',
        description:
          'Thêm linh kiện thay thế vào hóa đơn, kiểm tra tồn kho parts. Trigger trg_invoice_items_stock sẽ tự động trừ kho và trigger trg_invoices_total_amount sẽ tự động cập nhật tổng tiền hóa đơn.',
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
   * Preview trạng thái bảng trước khi thực thi stored procedure
   */
  async getProcedurePreview(procedureId: string, params: Record<string, any>): Promise<ProcedurePreviewResult> {
    switch (procedureId) {
      case 'sp_receive_device': {
        let deviceId = Number(params.device_id);
        if (!deviceId) {
          const dev = await this.dataSource.query(`SELECT TOP 1 id FROM devices ORDER BY id ASC`);
          deviceId = dev?.[0]?.id || 1;
        }

        const recId = Number(params.receptionist_id) || 1;
        const issue = params.issue_description || 'Màn hình chớp nháy và thiết bị nóng nhanh';
        const initCond = params.initial_condition || 'Trầy nhẹ nắp lưng';
        const access = params.accessories || 'Củ sạc zin 65W';
        const tType = params.ticket_type || 'repair';

        const deviceRows = await this.dataSource.query(
          `SELECT id, customer_id, device_name, device_type, brand, model, serial_number, is_under_warranty, warranty_expiry_date FROM devices WHERE id = @0`,
          [deviceId],
        );
        const existingTickets = await this.dataSource.query(
          `SELECT TOP 5 id, device_id, receptionist_id, status, ticket_type, issue_description, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at FROM tickets WHERE device_id = @0 ORDER BY id DESC`,
          [deviceId],
        );

        const exactSql = `DECLARE @new_ticket_id INT;
EXEC dbo.sp_receive_device
    @device_id = ${deviceId},
    @receptionist_id = ${recId},
    @issue_description = N'${issue.replace(/'/g, "''")}',
    @initial_condition = N'${initCond.replace(/'/g, "''")}',
    @accessories = N'${access.replace(/'/g, "''")}',
    @ticket_type = '${tType}',
    @ticket_id = @new_ticket_id OUTPUT;
SELECT @new_ticket_id AS new_ticket_id;`;

        return {
          exactSql,
          targetDesc: `Thiết bị: #${deviceId} (${deviceRows?.[0]?.device_name || 'Device'}) | Nhân viên tiếp nhận: #${recId}`,
          tables: [
            {
              tableName: 'devices',
              tableTitle: `Bảng thông tin thiết bị tiếp nhận: devices (Thiết bị #${deviceId})`,
              description: 'Thông tin thiết bị và trạng thái bảo hành được kiểm tra tự động bởi hàm fn_is_device_under_warranty',
              highlightColumns: ['device_name', 'is_under_warranty', 'warranty_expiry_date'],
              beforeRows: deviceRows,
            },
            {
              tableName: 'tickets',
              tableTitle: `Bảng phiếu sửa chữa của thiết bị: tickets (Thiết bị #${deviceId})`,
              description: 'Các phiếu sửa chữa hiện tại trước khi tạo thêm phiếu mới',
              highlightColumns: ['status', 'ticket_type', 'issue_description'],
              beforeRows: existingTickets,
            },
          ],
        };
      }

      case 'sp_process_ticket': {
        let ticketId = Number(params.ticket_id);
        if (!ticketId) {
          const tick = await this.dataSource.query(`SELECT TOP 1 id FROM tickets WHERE status != 'delivered' ORDER BY id DESC`);
          ticketId = tick?.[0]?.id || 1;
        }

        const newStatus = params.status || 'repairing';
        const techId = params.technician_id ? Number(params.technician_id) : 'NULL';
        const cause = params.fault_cause || 'Tụ lọc nguồn CPU bị phù';
        const solution = params.repair_solution || 'Thay tụ lọc nguồn và tra keo tản nhiệt';
        const estCost = Number(params.estimated_cost ?? 150);

        const ticketRows = await this.dataSource.query(
          `SELECT id, device_id, technician_id, status, ticket_type, fault_cause, repair_solution, estimated_cost, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at FROM tickets WHERE id = @0`,
          [ticketId],
        );
        const historyRows = await this.dataSource.query(
          `SELECT TOP 5 id, ticket_id, old_status, new_status, technician_id, note, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
          [ticketId],
        );

        const exactSql = `EXEC dbo.sp_process_ticket
    @ticket_id = ${ticketId},
    @status = '${newStatus}',
    @technician_id = ${techId},
    @fault_cause = N'${cause.replace(/'/g, "''")}',
    @repair_solution = N'${solution.replace(/'/g, "''")}',
    @estimated_cost = ${estCost.toFixed(2)};`;

        return {
          exactSql,
          targetDesc: `Phiếu sửa chữa: #${ticketId} | Trạng thái hiện tại: "${ticketRows?.[0]?.status || 'unknown'}" -> Chuyển sang: "${newStatus}"`,
          tables: [
            {
              tableName: 'tickets',
              tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
              description: 'Trạng thái hiện tại của phiếu trước khi cập nhật bước tiếp theo trong quy trình sửa chữa',
              highlightColumns: ['status', 'technician_id', 'fault_cause', 'repair_solution', 'estimated_cost'],
              beforeRows: ticketRows,
            },
            {
              tableName: 'ticket_status_history',
              tableTitle: `Bảng lịch sử trạng thái: ticket_status_history (Phiếu #${ticketId})`,
              description: 'Lịch sử chuyển đổi trạng thái đã được ghi nhận trước thời điểm gọi thủ tục',
              highlightColumns: ['old_status', 'new_status', 'created_at'],
              beforeRows: historyRows,
            },
          ],
        };
      }

      case 'sp_create_invoice': {
        let ticketId = Number(params.ticket_id);
        if (!ticketId) {
          const tick = await this.dataSource.query(`SELECT TOP 1 id FROM tickets WHERE status = 'completed' ORDER BY id DESC`);
          ticketId = tick?.[0]?.id || 1;
        }

        const laborFee = Number(params.labor_fee ?? 120);

        const ticketRows = await this.dataSource.query(
          `SELECT id, device_id, status, ticket_type, estimated_cost FROM tickets WHERE id = @0`,
          [ticketId],
        );
        const invoiceRows = await this.dataSource.query(
          `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM invoices WHERE ticket_id = @0`,
          [ticketId],
        );

        const exactSql = `DECLARE @new_invoice_id INT;
EXEC dbo.sp_create_invoice
    @ticket_id = ${ticketId},
    @labor_fee = ${laborFee.toFixed(2)},
    @invoice_id = @new_invoice_id OUTPUT;
SELECT @new_invoice_id AS new_invoice_id;`;

        return {
          exactSql,
          targetDesc: `Phiếu: #${ticketId} (Loại: ${ticketRows?.[0]?.ticket_type || 'repair'}) | Tiền công lập hóa đơn: $${laborFee.toFixed(2)}`,
          tables: [
            {
              tableName: 'tickets',
              tableTitle: `Bảng phiếu sửa chữa cần lập hóa đơn: tickets (Phiếu #${ticketId})`,
              description: 'Nếu loại phiếu là "warranty" hoặc "re_repair", thủ tục sẽ tự động chiết khấu 100% tiền công',
              highlightColumns: ['ticket_type', 'status'],
              beforeRows: ticketRows,
            },
            {
              tableName: 'invoices',
              tableTitle: `Bảng hóa đơn hiện có của phiếu: invoices (Phiếu #${ticketId})`,
              description: 'Danh sách hóa đơn của phiếu trước khi thực thi tạo hóa đơn mới',
              highlightColumns: ['labor_fee', 'discount_amount', 'total_amount', 'status'],
              beforeRows: invoiceRows,
            },
          ],
        };
      }

      case 'sp_add_invoice_part': {
        let invoiceId = Number(params.invoice_id);
        if (!invoiceId) {
          const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
          invoiceId = inv?.[0]?.id || 1;
        }

        let partId = Number(params.part_id);
        if (!partId) {
          const p = await this.dataSource.query(`SELECT TOP 1 id FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`);
          partId = p?.[0]?.id || 1;
        }

        const qty = Number(params.quantity || 1);

        const itemRows = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
          [invoiceId],
        );
        const partRows = await this.dataSource.query(
          `SELECT id, part_code, part_name, unit, price, stock_quantity FROM parts WHERE id = @0`,
          [partId],
        );
        const invoiceRows = await this.dataSource.query(
          `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status FROM invoices WHERE id = @0`,
          [invoiceId],
        );

        const exactSql = `EXEC dbo.sp_add_invoice_part
    @invoice_id = ${invoiceId},
    @part_id = ${partId},
    @quantity = ${qty};`;

        return {
          exactSql,
          targetDesc: `Hóa đơn: #${invoiceId} | Thêm linh kiện: #${partId} (${partRows?.[0]?.part_name || 'Part'}) | Số lượng: ${qty}`,
          tables: [
            {
              tableName: 'invoice_items',
              tableTitle: `Bảng chi tiết linh kiện trong hóa đơn: invoice_items (Hóa đơn #${invoiceId})`,
              description: 'Danh sách linh kiện hiện tại trong hóa đơn trước khi thêm linh kiện mới',
              highlightColumns: ['quantity', 'unit_price', 'total_price'],
              beforeRows: itemRows,
            },
            {
              tableName: 'parts',
              tableTitle: `Bảng tồn kho linh kiện: parts (Linh kiện #${partId} - ${partRows?.[0]?.part_name})`,
              description: 'Tồn kho linh kiện trước khi thêm vào hóa đơn (sẽ tự động trừ kho qua trigger)',
              highlightColumns: ['stock_quantity', 'price'],
              beforeRows: partRows,
            },
            {
              tableName: 'invoices',
              tableTitle: `Bảng hóa đơn cần cập nhật tổng tiền: invoices (Hóa đơn #${invoiceId})`,
              description: 'Tổng tiền hóa đơn hiện tại trước khi cộng thêm tiền linh kiện mới',
              highlightColumns: ['total_amount', 'labor_fee'],
              beforeRows: invoiceRows,
            },
          ],
        };
      }

      case 'sp_checkout_invoice': {
        let invoiceId = Number(params.invoice_id);
        if (!invoiceId) {
          const inv = await this.dataSource.query(`SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
          invoiceId = inv?.[0]?.id || 1;
        }

        const payMethod = params.payment_method || 'cash';

        const invoiceRows = await this.dataSource.query(
          `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE id = @0`,
          [invoiceId],
        );
        const ticketRows = await this.dataSource.query(
          `SELECT t.id, t.device_id, t.status, t.ticket_type, t.technician_id, FORMAT(t.completed_at, 'yyyy-MM-dd HH:mm') AS completed_at FROM tickets t JOIN invoices i ON i.ticket_id = t.id WHERE i.id = @0`,
          [invoiceId],
        );

        const exactSql = `EXEC dbo.sp_checkout_invoice
    @invoice_id = ${invoiceId},
    @payment_method = '${payMethod}';`;

        return {
          exactSql,
          targetDesc: `Hóa đơn: #${invoiceId} (Tổng tiền: $${invoiceRows?.[0]?.total_amount}) | Phương thức: ${payMethod}`,
          tables: [
            {
              tableName: 'invoices',
              tableTitle: `Bảng thao tác thanh toán: invoices (Hóa đơn #${invoiceId})`,
              description: 'Hóa đơn ở trạng thái chưa thanh toán (unpaid) trước khi xác nhận thu tiền',
              highlightColumns: ['status', 'payment_method', 'paid_at'],
              beforeRows: invoiceRows,
            },
            {
              tableName: 'tickets',
              tableTitle: `Bảng phiếu sửa chữa liên quan: tickets (Phiếu #${ticketRows?.[0]?.id})`,
              description: 'Phiếu sửa chữa sẽ tự động chuyển trạng thái sang "delivered" (đã bàn giao khách) khi hóa đơn được thanh toán',
              highlightColumns: ['status'],
              beforeRows: ticketRows,
            },
          ],
        };
      }

      default:
        throw new BadRequestException(`Không tìm thấy stored procedure: ${procedureId}`);
    }
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
      `SELECT id, customer_id, device_name, device_type, brand, model, serial_number, is_under_warranty, warranty_expiry_date FROM devices WHERE id = @0`,
      [dto.device_id],
    );
    const beforeTickets = await this.dataSource.query(
      `SELECT TOP 5 id, device_id, receptionist_id, status, ticket_type, issue_description, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at FROM tickets WHERE device_id = @0 ORDER BY id DESC`,
      [dto.device_id],
    );

    const exactSql = `DECLARE @new_ticket_id INT;
EXEC dbo.sp_receive_device
    @device_id = ${dto.device_id},
    @receptionist_id = ${dto.receptionist_id},
    @issue_description = N'${(dto.issue_description || '').replace(/'/g, "''")}',
    @initial_condition = N'${(dto.initial_condition || '').replace(/'/g, "''")}',
    @accessories = N'${(dto.accessories || '').replace(/'/g, "''")}',
    @ticket_type = '${dto.ticket_type || 'repair'}',
    @ticket_id = @new_ticket_id OUTPUT;
SELECT @new_ticket_id AS new_ticket_id;`;

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
      ? await this.dataSource.query(`SELECT id, device_id, receptionist_id, status, ticket_type, issue_description, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at FROM tickets WHERE id = @0`, [newTicketId])
      : [];
    const afterHistory = newTicketId
      ? await this.dataSource.query(
          `SELECT id, ticket_id, old_status, new_status, technician_id, note, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
          [newTicketId],
        )
      : [];
    const afterTickets = await this.dataSource.query(
      `SELECT TOP 5 id, device_id, receptionist_id, status, ticket_type, issue_description, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at FROM tickets WHERE device_id = @0 ORDER BY id DESC`,
      [dto.device_id],
    );

    return {
      procedure: 'dbo.sp_receive_device',
      newTicketId,
      exactSql,
      tables: [
        {
          tableName: 'tickets',
          tableTitle: `Bảng phiếu sửa chữa của thiết bị: tickets (Thiết bị #${dto.device_id})`,
          description: `Đã chèn thành công Phiếu sửa chữa mới #${newTicketId}`,
          highlightColumns: ['id', 'status', 'ticket_type', 'issue_description'],
          beforeRows: beforeTickets,
          afterRows: afterTickets,
          statusNote: `✓ [INSERT THÀNH CÔNG] Đã tạo mới Phiếu sửa chữa #${newTicketId} với trạng thái "received", loại phiếu: "${afterTicket?.[0]?.ticket_type}".`,
        },
        {
          tableName: 'ticket_status_history',
          tableTitle: `Bảng lịch sử trạng thái: ticket_status_history (Phiếu mới #${newTicketId})`,
          description: 'Hệ thống tự động ghi vết audit log trạng thái ban đầu của phiếu',
          highlightColumns: ['new_status', 'created_at'],
          beforeRows: [],
          afterRows: afterHistory,
          statusNote: `✓ [TỰ ĐỘNG GHI VẾT] Trigger và thủ tục đã tự động ghi nhận bước tiếp nhận ban đầu (new_status = 'received').`,
        },
      ],
      before: {
        device: beforeDevice,
        recentTickets: beforeTickets,
      },
      after: {
        createdTicket: afterTicket,
        auditHistory: afterHistory,
        recentTickets: afterTickets,
      },
      message: `Tiếp nhận thiết bị #${dto.device_id} thành công! Đã tạo Phiếu sửa chữa #${newTicketId} (trạng thái: received).`,
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
      `SELECT id, device_id, technician_id, status, ticket_type, fault_cause, repair_solution, estimated_cost, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    if (!beforeTicket || beforeTicket.length === 0) {
      throw new NotFoundException(`Không tìm thấy phiếu sửa chữa #${dto.ticket_id}`);
    }

    const beforeHistory = await this.dataSource.query(
      `SELECT TOP 5 id, ticket_id, old_status, new_status, technician_id, note, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [dto.ticket_id],
    );

    const exactSql = `EXEC dbo.sp_process_ticket
    @ticket_id = ${dto.ticket_id},
    @status = '${dto.status}',
    @technician_id = ${dto.technician_id || 'NULL'},
    @fault_cause = N'${(dto.fault_cause || '').replace(/'/g, "''")}',
    @repair_solution = N'${(dto.repair_solution || '').replace(/'/g, "''")}',
    @estimated_cost = ${Number(dto.estimated_cost ?? 0).toFixed(2)};`;

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
      `SELECT id, device_id, technician_id, status, ticket_type, fault_cause, repair_solution, estimated_cost, FORMAT(received_at, 'yyyy-MM-dd HH:mm') AS received_at, FORMAT(completed_at, 'yyyy-MM-dd HH:mm') AS completed_at FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    const afterHistory = await this.dataSource.query(
      `SELECT TOP 5 id, ticket_id, old_status, new_status, technician_id, note, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [dto.ticket_id],
    );

    return {
      procedure: 'dbo.sp_process_ticket',
      ticketId: dto.ticket_id,
      exactSql,
      tables: [
        {
          tableName: 'tickets',
          tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${dto.ticket_id})`,
          description: `Cập nhật trạng thái phiếu từ "${beforeTicket?.[0]?.status}" sang "${afterTicket?.[0]?.status}"`,
          highlightColumns: ['status', 'technician_id', 'fault_cause', 'repair_solution', 'estimated_cost', 'completed_at'],
          beforeRows: beforeTicket,
          afterRows: afterTicket,
          statusNote: `✓ [UPDATE THÀNH CÔNG] Trạng thái phiếu #${dto.ticket_id} chuyển sang "${afterTicket?.[0]?.status}". Kỹ thuật viên #${afterTicket?.[0]?.technician_id} phụ trách.`,
        },
        {
          tableName: 'ticket_status_history',
          tableTitle: `Bảng lịch sử trạng thái: ticket_status_history (Phiếu #${dto.ticket_id})`,
          description: 'Hệ thống tự động ghi nhận bước chuyển trạng thái vào lịch sử audit log',
          highlightColumns: ['old_status', 'new_status', 'created_at'],
          beforeRows: beforeHistory,
          afterRows: afterHistory,
          statusNote: `✓ [TỰ ĐỘNG GHI VẾT] Trigger đã ghi nhận 1 bản ghi mới chuyển từ "${beforeTicket?.[0]?.status}" sang "${afterTicket?.[0]?.status}".`,
        },
      ],
      before: {
        ticket: beforeTicket,
        statusHistory: beforeHistory,
      },
      after: {
        ticket: afterTicket,
        statusHistory: afterHistory,
      },
      message: `Cập nhật tiến trình phiếu #${dto.ticket_id} thành công! Trạng thái mới: ${dto.status}.`,
    };
  }

  /**
   * 3. sp_create_invoice
   */
  async executeCreateInvoice(dto: { ticket_id: number; labor_fee?: number }) {
    const beforeTicket = await this.dataSource.query(
      `SELECT id, device_id, status, ticket_type, estimated_cost FROM tickets WHERE id = @0`,
      [dto.ticket_id],
    );
    if (!beforeTicket || beforeTicket.length === 0) {
      throw new NotFoundException(`Không tìm thấy phiếu #${dto.ticket_id}`);
    }

    const beforeInvoices = await this.dataSource.query(
      `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM invoices WHERE ticket_id = @0`,
      [dto.ticket_id],
    );

    const laborFee = Number(dto.labor_fee ?? 0);
    const exactSql = `DECLARE @new_invoice_id INT;
EXEC dbo.sp_create_invoice
    @ticket_id = ${dto.ticket_id},
    @labor_fee = ${laborFee.toFixed(2)},
    @invoice_id = @new_invoice_id OUTPUT;
SELECT @new_invoice_id AS new_invoice_id;`;

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
      laborFee,
    ]);

    const newInvoiceId = result?.[0]?.new_invoice_id;

    const afterInvoices = await this.dataSource.query(
      `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status, FORMAT(created_at, 'yyyy-MM-dd HH:mm') AS created_at FROM invoices WHERE ticket_id = @0 ORDER BY id DESC`,
      [dto.ticket_id],
    );

    return {
      procedure: 'dbo.sp_create_invoice',
      newInvoiceId,
      exactSql,
      tables: [
        {
          tableName: 'invoices',
          tableTitle: `Bảng hóa đơn của phiếu: invoices (Phiếu #${dto.ticket_id})`,
          description: `Đã chèn thành công Hóa đơn mới #${newInvoiceId}`,
          highlightColumns: ['id', 'labor_fee', 'discount_amount', 'total_amount', 'status'],
          beforeRows: beforeInvoices,
          afterRows: afterInvoices,
          statusNote: `✓ [INSERT THÀNH CÔNG] Đã lập Hóa đơn #${newInvoiceId} với tiền công $${laborFee}, chiết khấu $${afterInvoices?.[0]?.discount_amount}, tổng tiền: $${afterInvoices?.[0]?.total_amount}.`,
        },
        {
          tableName: 'tickets',
          tableTitle: `Bảng phiếu sửa chữa được lập hóa đơn: tickets (Phiếu #${dto.ticket_id})`,
          description: 'Thông tin phiếu làm căn cứ lập hóa đơn',
          highlightColumns: ['ticket_type', 'status'],
          beforeRows: beforeTicket,
          afterRows: beforeTicket,
          statusNote: `ℹ Phiếu loại "${beforeTicket?.[0]?.ticket_type}". Nếu là bảo hành (warranty) thì được miễn 100% tiền công.`,
        },
      ],
      before: {
        ticket: beforeTicket,
        invoices: beforeInvoices,
      },
      after: {
        invoices: afterInvoices,
      },
      message: `Lập hóa đơn mới #${newInvoiceId} thành công cho phiếu #${dto.ticket_id}!`,
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
      `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    if (!beforeInvoice || beforeInvoice.length === 0) {
      throw new NotFoundException(`Không tìm thấy hóa đơn #${dto.invoice_id}`);
    }

    const beforePart = await this.dataSource.query(
      `SELECT id, part_code, part_name, unit, price, stock_quantity FROM parts WHERE id = @0`,
      [dto.part_id],
    );
    const beforeItems = await this.dataSource.query(
      `SELECT id, invoice_id, part_id, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
      [dto.invoice_id],
    );

    const exactSql = `EXEC dbo.sp_add_invoice_part
    @invoice_id = ${dto.invoice_id},
    @part_id = ${dto.part_id},
    @quantity = ${dto.quantity};`;

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
      `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    const afterPart = await this.dataSource.query(
      `SELECT id, part_code, part_name, unit, price, stock_quantity FROM parts WHERE id = @0`,
      [dto.part_id],
    );
    const afterItems = await this.dataSource.query(
      `SELECT id, invoice_id, part_id, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
      [dto.invoice_id],
    );

    return {
      procedure: 'dbo.sp_add_invoice_part',
      exactSql,
      tables: [
        {
          tableName: 'invoice_items',
          tableTitle: `Bảng thao tác trực tiếp: invoice_items (Hóa đơn #${dto.invoice_id})`,
          description: `Thêm linh kiện #${dto.part_id} (${afterPart?.[0]?.part_name}) số lượng: ${dto.quantity}`,
          highlightColumns: ['quantity', 'unit_price', 'total_price'],
          beforeRows: beforeItems,
          afterRows: afterItems,
          statusNote: `✓ [THÊM LINH KIỆN THÀNH CÔNG] Đã ghi nhận linh kiện vào chi tiết hóa đơn.`,
        },
        {
          tableName: 'parts',
          tableTitle: `Bảng linh kiện: parts (Linh kiện #${dto.part_id} - ${afterPart?.[0]?.part_name})`,
          description: 'Trigger trg_invoice_items_stock tự động trừ tồn kho',
          highlightColumns: ['stock_quantity'],
          beforeRows: beforePart,
          afterRows: afterPart,
          statusNote: `✓ [TỰ ĐỘNG TRỪ KHO] Tồn kho tự động giảm từ ${beforePart?.[0]?.stock_quantity} xuống ${afterPart?.[0]?.stock_quantity} cái.`,
        },
        {
          tableName: 'invoices',
          tableTitle: `Bảng hóa đơn: invoices (Hóa đơn #${dto.invoice_id})`,
          description: 'Trigger trg_invoices_total_amount tự động tính lại tổng tiền hóa đơn',
          highlightColumns: ['total_amount'],
          beforeRows: beforeInvoice,
          afterRows: afterInvoice,
          statusNote: `✓ [TỰ ĐỘNG TÍNH LẠI TỔNG TIỀN] Tổng tiền tự động tăng từ $${beforeInvoice?.[0]?.total_amount} lên $${afterInvoice?.[0]?.total_amount}.`,
        },
      ],
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
      message: `Đã thêm linh kiện #${dto.part_id} vào hóa đơn #${dto.invoice_id}! Tồn kho và tổng tiền đã tự động cập nhật.`,
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
      `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    if (!beforeInvoice || beforeInvoice.length === 0) {
      throw new NotFoundException(`Không tìm thấy hóa đơn #${dto.invoice_id}`);
    }

    const beforeTicket = await this.dataSource.query(
      `SELECT t.id, t.device_id, t.status, t.ticket_type, t.technician_id, FORMAT(t.completed_at, 'yyyy-MM-dd HH:mm') AS completed_at FROM tickets t JOIN invoices i ON i.ticket_id = t.id WHERE i.id = @0`,
      [dto.invoice_id],
    );

    const payMethod = dto.payment_method || 'cash';
    const exactSql = `EXEC dbo.sp_checkout_invoice
    @invoice_id = ${dto.invoice_id},
    @payment_method = '${payMethod}';`;

    const callSql = `
      EXEC dbo.sp_checkout_invoice
        @invoice_id = @0,
        @payment_method = @1;
    `;

    await this.dataSource.query(callSql, [
      dto.invoice_id,
      payMethod,
    ]);

    const afterInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    const afterTicket = await this.dataSource.query(
      `SELECT t.id, t.device_id, t.status, t.ticket_type, t.technician_id, FORMAT(t.completed_at, 'yyyy-MM-dd HH:mm') AS completed_at FROM tickets t JOIN invoices i ON i.ticket_id = t.id WHERE i.id = @0`,
      [dto.invoice_id],
    );

    return {
      procedure: 'dbo.sp_checkout_invoice',
      exactSql,
      tables: [
        {
          tableName: 'invoices',
          tableTitle: `Bảng hóa đơn: invoices (Hóa đơn #${dto.invoice_id})`,
          description: 'Hóa đơn đã được thanh toán và chuyển trạng thái',
          highlightColumns: ['status', 'payment_method', 'paid_at'],
          beforeRows: beforeInvoice,
          afterRows: afterInvoice,
          statusNote: `✓ [THANH TOÁN THÀNH CÔNG] Hóa đơn chuyển từ "${beforeInvoice?.[0]?.status}" sang "${afterInvoice?.[0]?.status}". Phương thức: ${afterInvoice?.[0]?.payment_method}.`,
        },
        {
          tableName: 'tickets',
          tableTitle: `Bảng phiếu sửa chữa: tickets (Phiếu #${afterTicket?.[0]?.id})`,
          description: 'Thủ tục tự động bàn giao thiết bị khi thanh toán xong',
          highlightColumns: ['status'],
          beforeRows: beforeTicket,
          afterRows: afterTicket,
          statusNote: `✓ [TỰ ĐỘNG BÀN GIAO] Phiếu sửa chữa tự động chuyển trạng thái từ "${beforeTicket?.[0]?.status}" sang "delivered" (Đã bàn giao khách).`,
        },
      ],
      before: {
        invoice: beforeInvoice,
        ticket: beforeTicket,
      },
      after: {
        invoice: afterInvoice,
        ticket: afterTicket,
      },
      message: `Thanh toán hóa đơn #${dto.invoice_id} thành công! Phiếu #${afterTicket?.[0]?.id} đã tự động chuyển sang đã bàn giao (delivered).`,
    };
  }
}
