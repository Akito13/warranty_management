import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";

export interface TriggerCatalogItem {
  id: string;
  name: string;
  table: string;
  timing: string;
  type: "guard" | "cascade" | "audit";
  typeLabel: string;
  description: string;
  scenarios: Array<{
    id: string;
    title: string;
    description: string;
    expectedOutcome: "STOPPED" | "MODIFIED";
    actionDescription: string;
    sqlTemplate: string;
  }>;
}

export interface TriggerTableComparison {
  tableName: string;
  tableTitle: string;
  description?: string;
  highlightColumns?: string[];
  beforeRows: Record<string, any>[];
  afterRows?: Record<string, any>[];
  statusNote?: string;
}

export interface TriggerPreviewResult {
  exactSql: string;
  targetDesc: string;
  tables: TriggerTableComparison[];
}

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(private readonly dataSource: DataSource) {}

  getCatalog(): TriggerCatalogItem[] {
    return [
      {
        id: "trg_invoice_items_stock",
        name: "trg_invoice_items_stock",
        table: "invoice_items",
        timing: "AFTER INSERT, UPDATE, DELETE",
        type: "guard",
        typeLabel: "Kiểm soát tồn kho & Tự động trừ kho",
        description:
          "Kiểm tra tồn kho linh kiện trong bảng parts khi thêm/sửa/xóa chi tiết hóa đơn. Nếu số lượng yêu cầu vượt quá tồn kho hiện có, trigger sẽ ROLLBACK TRANSACTION và THROW lỗi 50001. Nếu hợp lệ, trigger tự động trừ số lượng tồn kho tương ứng.",
        scenarios: [
          {
            id: "stock_exceeded_fail",
            title:
              "Kịch bản 1A: Chặn khi số lượng vượt quá tồn kho (Trigger STOP)",
            description:
              "Thực hiện INSERT vào invoice_items với số lượng linh kiện lớn hơn số lượng còn lại trong kho của linh kiện đó.",
            expectedOutcome: "STOPPED",
            actionDescription:
              "INSERT INTO invoice_items với quantity > parts.stock_quantity",
            sqlTemplate:
              "INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES ({invoice_id}, {part_id}, {quantity}, {unit_price});",
          },
          {
            id: "stock_deduction_success",
            title:
              "Kịch bản 1B: Tự động trừ tồn kho khi số lượng hợp lệ (Trigger MODIFIES)",
            description:
              "Thực hiện INSERT vào invoice_items với số lượng hợp lệ. Trigger tự động giảm parts.stock_quantity tương ứng với số lượng thêm.",
            expectedOutcome: "MODIFIED",
            actionDescription:
              "INSERT INTO invoice_items với quantity hợp lệ; parts.stock_quantity tự động giảm",
            sqlTemplate:
              "INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES ({invoice_id}, {part_id}, 1, {unit_price});",
          },
        ],
      },
      {
        id: "trg_invoices_total_amount",
        name: "trg_invoices_total_amount",
        table: "invoice_items",
        timing: "AFTER INSERT, UPDATE, DELETE",
        type: "cascade",
        typeLabel: "Tự động tính lại tổng tiền hóa đơn khi thay đổi linh kiện",
        description:
          "Tự động kích hoạt khi có bản ghi linh kiện được thêm, sửa hoặc xóa trong invoice_items. Trigger gọi hàm fn_calculate_parts_total để tính lại tổng tiền phụ tùng và cập nhật invoices.total_amount trên hóa đơn chưa thanh toán.",
        scenarios: [
          {
            id: "item_added_recalculate_total",
            title:
              "Kịch bản 2: Thêm linh kiện -> Tự động tính lại tổng tiền (Trigger MODIFIES)",
            description:
              "Chèn thêm linh kiện vào hóa đơn chưa thanh toán. Trigger tự động cộng dồn tiền linh kiện mới vào tổng tiền hóa đơn.",
            expectedOutcome: "MODIFIED",
            actionDescription:
              "INSERT INTO invoice_items -> invoices.total_amount tự động cập nhật",
            sqlTemplate:
              "INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES ({invoice_id}, {part_id}, 1, {unit_price});",
          },
        ],
      },
      {
        id: "trg_invoices_labor_update",
        name: "trg_invoices_labor_update",
        table: "invoices",
        timing: "AFTER INSERT, UPDATE",
        type: "cascade",
        typeLabel: "Tự động tính lại tổng tiền khi đổi tiền công",
        description:
          "Lắng nghe sự kiện cập nhật tiền công (labor_fee) hoặc chiết khấu (discount_amount) trên bảng invoices. Trigger tự động tính lại total_amount = labor_fee + fn_calculate_parts_total - discount_amount.",
        scenarios: [
          {
            id: "labor_fee_changed_recalc",
            title:
              "Kịch bản 3: Sửa tiền công labor_fee -> Tự động tính lại tổng tiền (Trigger MODIFIES)",
            description:
              "Cập nhật tăng tiền công dịch vụ thêm $50.00. Trigger tự động tính lại tổng tiền hóa đơn invoices.total_amount tăng theo.",
            expectedOutcome: "MODIFIED",
            actionDescription:
              "UPDATE invoices SET labor_fee = labor_fee + 50.00",
            sqlTemplate:
              "UPDATE invoices SET labor_fee = labor_fee + 50.00 WHERE id = {invoice_id};",
          },
        ],
      },
      {
        id: "trg_tickets_workflow_guard",
        name: "trg_tickets_workflow_guard",
        table: "tickets",
        timing: "AFTER INSERT, UPDATE",
        type: "guard",
        typeLabel:
          "Bảo vệ quy trình trạng thái phiếu & Tự gán thời gian hoàn thành",
        description:
          "1) Bắt buộc có kỹ thuật viên (technician_id IS NOT NULL) khi chuyển sang trạng thái repairing hoặc completed (Lỗi 50003). 2) Đảm bảo quy trình trạng thái hợp lệ, cấm mở lại phiếu đã delivered (Lỗi 50004). 3) Tự động gán completed_at khi hoàn tất.",
        scenarios: [
          {
            id: "guard_missing_technician",
            title:
              "Kịch bản 4A: Chặn chuyển sang sửa chữa nếu thiếu kỹ thuật viên (Trigger STOP)",
            description:
              'Cố tình cập nhật status = "repairing" khi technician_id là NULL. Trigger sẽ ROLLBACK và báo lỗi 50003.',
            expectedOutcome: "STOPPED",
            actionDescription:
              'UPDATE tickets SET status = "repairing", technician_id = NULL',
            sqlTemplate:
              "UPDATE tickets SET status = 'repairing', technician_id = NULL WHERE id = {ticket_id};",
          },
          {
            id: "guard_invalid_transition",
            title:
              "Kịch bản 4B: Chặn đảo ngược trạng thái phiếu đã giao khách (Trigger STOP)",
            description:
              'Cố tình chuyển trạng thái phiếu từ "delivered" (đã bàn giao) về "inspecting". Trigger sẽ ROLLBACK và báo lỗi 50004.',
            expectedOutcome: "STOPPED",
            actionDescription:
              'UPDATE tickets SET status = "inspecting" WHERE status = "delivered"',
            sqlTemplate:
              "UPDATE tickets SET status = 'inspecting' WHERE id = {delivered_ticket_id};",
          },
          {
            id: "auto_completed_timestamp",
            title:
              "Kịch bản 4C: Tự động điền ngày giờ hoàn tất completed_at (Trigger MODIFIES)",
            description:
              'Cập nhật status = "completed" với kỹ thuật viên hợp lệ. Trigger tự động gán completed_at = GETDATE().',
            expectedOutcome: "MODIFIED",
            actionDescription:
              'UPDATE tickets SET status = "completed" -> completed_at tự động gán',
            sqlTemplate:
              "UPDATE tickets SET status = 'completed', technician_id = {technician_id} WHERE id = {ticket_id};",
          },
        ],
      },
      {
        id: "trg_tickets_audit_history",
        name: "trg_tickets_audit_history",
        table: "tickets",
        timing: "AFTER INSERT, UPDATE",
        type: "audit",
        typeLabel: "Tự động ghi vết lịch sử thay đổi trạng thái phiếu",
        description:
          "Tự động chèn một bản ghi mới vào bảng ticket_status_history mỗi khi phiếu bảo hành được tạo mới hoặc thay đổi trạng thái (UPDATE status), ghi nhận trạng thái cũ (old_status), trạng thái mới (new_status), kỹ thuật viên và mốc thời gian.",
        scenarios: [
          {
            id: "audit_status_transition",
            title:
              "Kịch bản 5: Đổi trạng thái phiếu -> Tự động chèn dòng lịch sử (Trigger MODIFIES)",
            description:
              'Cập nhật status từ "received" sang "inspecting". Trigger tự động ghi 1 dòng audit log vào ticket_status_history.',
            expectedOutcome: "MODIFIED",
            actionDescription:
              'UPDATE tickets SET status = "inspecting" -> INSERT INTO ticket_status_history',
            sqlTemplate:
              "UPDATE tickets SET status = 'inspecting' WHERE id = {ticket_id};",
          },
        ],
      },
      {
        id: "trg_invoice_items_freeze_paid",
        name: "trg_invoice_items_freeze_paid",
        table: "invoice_items",
        timing: "AFTER INSERT, UPDATE, DELETE (Ưu tiên First)",
        type: "guard",
        typeLabel: "Đóng băng linh kiện trên hóa đơn đã thanh toán",
        description:
          'Tính bất biến tài chính: Ngăn chặn tuyệt đối việc thêm, sửa hoặc xóa linh kiện trên các hóa đơn đã thanh toán (status = "paid"). Trigger chạy ở mức ưu tiên First và THROW lỗi 50035.',
        scenarios: [
          {
            id: "paid_invoice_items_freeze_fail",
            title:
              "Kịch bản 6: Chặn thêm linh kiện vào hóa đơn đã thanh toán (Trigger STOP)",
            description:
              'Cố tình chèn thêm linh kiện vào hóa đơn đã hoàn tất thanh toán (status = "paid"). Trigger chặn lại với lỗi 50035.',
            expectedOutcome: "STOPPED",
            actionDescription:
              'INSERT INTO invoice_items WHERE invoice.status = "paid"',
            sqlTemplate:
              "INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES ({paid_invoice_id}, {part_id}, 1, {unit_price});",
          },
        ],
      },
      {
        id: "trg_invoices_freeze_paid_amounts",
        name: "trg_invoices_freeze_paid_amounts",
        table: "invoices",
        timing: "AFTER UPDATE",
        type: "guard",
        typeLabel: "Đóng băng số liệu tài chính hóa đơn đã thanh toán",
        description:
          'Tính bất biến tài chính: Nghiêm cấm mọi hành vi thay đổi tiền công (labor_fee), chiết khấu (discount_amount), tổng tiền (total_amount) hoặc trạng thái trên hóa đơn đã thanh toán ("paid"). Trigger THROW lỗi 50036.',
        scenarios: [
          {
            id: "paid_financials_freeze_fail",
            title:
              "Kịch bản 7: Chặn sửa đổi số tiền trên hóa đơn đã thanh toán (Trigger STOP)",
            description:
              'Cố gắng tăng tiền công labor_fee thêm $100 trên hóa đơn đã thanh toán (status = "paid"). Trigger chặn lại với lỗi 50036.',
            expectedOutcome: "STOPPED",
            actionDescription:
              'UPDATE invoices SET labor_fee = labor_fee + 100 WHERE status = "paid"',
            sqlTemplate:
              "UPDATE invoices SET labor_fee = labor_fee + 100.00 WHERE id = {paid_invoice_id};",
          },
        ],
      },
    ];
  }

  async getSampleData() {
    const parts = await this.dataSource.query(
      `SELECT TOP 5 id, part_name, unit, price, stock_quantity FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
    );
    const unpaidInvoices = await this.dataSource.query(
      `SELECT TOP 5 id, ticket_id, labor_fee, discount_amount, total_amount, status FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
    );
    const paidInvoices = await this.dataSource.query(
      `SELECT TOP 5 id, ticket_id, labor_fee, discount_amount, total_amount, status, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE status = 'paid' ORDER BY id DESC`,
    );
    const tickets = await this.dataSource.query(
      `SELECT TOP 5 id, device_id, technician_id, status, ticket_type, FORMAT(completed_at, 'yyyy-MM-dd HH:mm') AS completed_at FROM tickets ORDER BY id DESC`,
    );
    const deliveredTickets = await this.dataSource.query(
      `SELECT TOP 5 id, device_id, technician_id, status, ticket_type FROM tickets WHERE status = 'delivered' ORDER BY id DESC`,
    );
    const technicians = await this.dataSource.query(
      `SELECT TOP 5 id, full_name FROM employees WHERE role = 'technician' AND is_active = 1`,
    );

    return {
      parts,
      unpaidInvoices,
      paidInvoices,
      tickets,
      deliveredTickets,
      technicians,
    };
  }

  /**
   * Generates transparent preview tables and exact parameterized SQL before execution.
   */
  async getTriggerPreview(
    triggerId: string,
    scenarioId: string,
  ): Promise<TriggerPreviewResult> {
    switch (triggerId) {
      case "trg_invoice_items_stock": {
        const inv = await this.dataSource.query(
          `SELECT TOP 1 id, ticket_id, labor_fee, total_amount FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
        );
        const invoiceId = inv?.[0]?.id || 18;

        const part = await this.dataSource.query(
          `SELECT TOP 1 id, part_name, unit, price, stock_quantity FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
        );
        const partId = part?.[0]?.id || 1;
        const partName = part?.[0]?.part_name || "Linh kiện";
        const currentStock = Number(part?.[0]?.stock_quantity || 25);
        const unitPrice = Number(part?.[0]?.price || 50);

        const beforeInvoiceItems = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
          [invoiceId],
        );
        const beforePart = await this.dataSource.query(
          `SELECT id, part_name, unit, price, stock_quantity, updated_at FROM parts WHERE id = @0`,
          [partId],
        );

        if (scenarioId === "stock_exceeded_fail") {
          const reqQty = currentStock + 9999;
          const exactSql = `-- Mục tiêu: Thêm linh kiện #${partId} (${partName}) vào Hóa đơn #${invoiceId}\n-- Tồn kho hiện có: ${currentStock} cái | Số lượng yêu cầu: ${reqQty} cái (VƯỢT TỒN KHO)\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, ${reqQty}, ${unitPrice.toFixed(2)});`;
          return {
            exactSql,
            targetDesc: `Linh kiện: #${partId} (${partName}) | Tồn kho hiện có: ${currentStock} cái | Hóa đơn: #${invoiceId}`,
            tables: [
              {
                tableName: "invoice_items",
                tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
                description: `Bảng nhận thao tác INSERT linh kiện mới cho hóa đơn #${invoiceId}`,
                highlightColumns: ["quantity", "unit_price", "total_price"],
                beforeRows: beforeInvoiceItems,
              },
              {
                tableName: "parts",
                tableTitle: `Bảng liên quan kiểm tra & trừ kho: parts (Linh kiện #${partId} - ${partName})`,
                description: `Trigger kiểm tra tồn kho tại bảng parts, nếu vượt quá tồn kho sẽ ROLLBACK`,
                highlightColumns: ["stock_quantity"],
                beforeRows: beforePart,
              },
            ],
          };
        } else {
          const exactSql = `-- Mục tiêu: Thêm linh kiện #${partId} (${partName}) vào Hóa đơn #${invoiceId}\n-- Tồn kho hiện có: ${currentStock} cái | Số lượng yêu cầu: 1 cái (HỢP LỆ)\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, 1, ${unitPrice.toFixed(2)});`;
          return {
            exactSql,
            targetDesc: `Linh kiện: #${partId} (${partName}) | Tồn kho hiện có: ${currentStock} cái | Hóa đơn: #${invoiceId}`,
            tables: [
              {
                tableName: "invoice_items",
                tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
                description: `Thêm 1 linh kiện vào hóa đơn #${invoiceId}`,
                highlightColumns: ["quantity", "unit_price", "total_price"],
                beforeRows: beforeInvoiceItems,
              },
              {
                tableName: "parts",
                tableTitle: `Bảng liên quan kiểm tra & trừ kho: parts (Linh kiện #${partId} - ${partName})`,
                description: `Trigger tự động giảm parts.stock_quantity từ ${currentStock} xuống ${currentStock - 1}`,
                highlightColumns: ["stock_quantity"],
                beforeRows: beforePart,
              },
            ],
          };
        }
      }

      case "trg_invoices_total_amount": {
        const inv = await this.dataSource.query(
          `SELECT TOP 1 id, ticket_id, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
        );
        const invoiceId = inv?.[0]?.id || 18;
        const part = await this.dataSource.query(
          `SELECT TOP 1 id, part_name, price FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
        );
        const partId = part?.[0]?.id || 1;
        const partName = part?.[0]?.part_name || "Linh kiện";
        const unitPrice = Number(part?.[0]?.price || 50);

        const beforeInvoiceItems = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
          [invoiceId],
        );
        const beforeInvoice = await this.dataSource.query(
          `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE id = @0`,
          [invoiceId],
        );

        const exactSql = `-- Mục tiêu: Thêm linh kiện #${partId} (${partName}, đơn giá: $${unitPrice.toFixed(2)}) vào Hóa đơn #${invoiceId}\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, 1, ${unitPrice.toFixed(2)});\n-- Trigger sẽ tự động tính lại invoices.total_amount = labor_fee + fn_calculate_parts_total`;

        return {
          exactSql,
          targetDesc: `Hóa đơn: #${invoiceId} | Tiền công: $${inv?.[0]?.labor_fee} | Tổng tiền cũ: $${inv?.[0]?.total_amount} | Linh kiện: #${partId}`,
          tables: [
            {
              tableName: "invoice_items",
              tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
              description: `Thêm 1 linh kiện mới vào hóa đơn #${invoiceId}`,
              highlightColumns: ["quantity", "unit_price", "total_price"],
              beforeRows: beforeInvoiceItems,
            },
            {
              tableName: "invoices",
              tableTitle: `Bảng liên quan Trigger tự động cập nhật: invoices (Hóa đơn #${invoiceId})`,
              description: `Trigger tự động tính toán lại total_amount của hóa đơn`,
              highlightColumns: [
                "labor_fee",
                "discount_amount",
                "total_amount",
              ],
              beforeRows: beforeInvoice,
            },
          ],
        };
      }

      case "trg_invoices_labor_update": {
        const inv = await this.dataSource.query(
          `SELECT TOP 1 id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
        );
        const invoiceId = inv?.[0]?.id || 18;

        const beforeInvoice = await this.dataSource.query(
          `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE id = @0`,
          [invoiceId],
        );
        const beforeInvoiceItems = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = @0`,
          [invoiceId],
        );

        const exactSql = `-- Mục tiêu: Tăng tiền công labor_fee thêm $50.00 trên Hóa đơn #${invoiceId}\nUPDATE invoices\nSET labor_fee = labor_fee + 50.00, updated_at = GETDATE()\nWHERE id = ${invoiceId};\n-- Trigger sẽ bắt sự kiện UPDATE(labor_fee) và tự động tính lại total_amount`;

        return {
          exactSql,
          targetDesc: `Hóa đơn: #${invoiceId} | Tiền công hiện tại: $${inv?.[0]?.labor_fee} | Tăng thêm: $50.00`,
          tables: [
            {
              tableName: "invoices",
              tableTitle: `Bảng thao tác trực tiếp: invoices (Hóa đơn #${invoiceId})`,
              description: `Cập nhật labor_fee tăng $50.00 -> Trigger tự động tính lại total_amount`,
              highlightColumns: ["labor_fee", "total_amount"],
              beforeRows: beforeInvoice,
            },
            {
              tableName: "invoice_items",
              tableTitle: `Bảng tham chiếu tiền linh kiện: invoice_items (Hóa đơn #${invoiceId})`,
              description: `Tiền linh kiện cố định, tổng tiền tăng phản ánh chính xác tiền công tăng`,
              highlightColumns: ["total_price"],
              beforeRows: beforeInvoiceItems,
            },
          ],
        };
      }

      case "trg_tickets_workflow_guard": {
        if (scenarioId === "guard_missing_technician") {
          const t = await this.dataSource.query(
            `SELECT TOP 1 id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE status = 'received' ORDER BY id DESC`,
          );
          const ticketId = t?.[0]?.id || 1;
          const exactSql = `-- Mục tiêu: Cố tình chuyển phiếu #${ticketId} sang 'repairing' mà KHÔNG phân công kỹ thuật viên\nUPDATE tickets\nSET status = 'repairing', technician_id = NULL\nWHERE id = ${ticketId};\n-- Trigger sẽ phát hiện technician_id IS NULL và THROW lỗi 50003`;

          return {
            exactSql,
            targetDesc: `Phiếu sửa chữa: #${ticketId} | Trạng thái hiện tại: 'received' | technician_id = NULL`,
            tables: [
              {
                tableName: "tickets",
                tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
                description: `Cố tình chuyển sang 'repairing' khi chưa có kỹ thuật viên (technician_id = NULL)`,
                highlightColumns: ["status", "technician_id"],
                beforeRows: t,
              },
            ],
          };
        } else if (scenarioId === "guard_invalid_transition") {
          const del = await this.dataSource.query(
            `SELECT TOP 1 id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE status = 'delivered' ORDER BY id DESC`,
          );
          const ticketId = del?.[0]?.id || 20;
          const exactSql = `-- Mục tiêu: Cố tình đảo ngược phiếu #${ticketId} đã 'delivered' về 'inspecting'\nUPDATE tickets\nSET status = 'inspecting'\nWHERE id = ${ticketId};\n-- Trigger phát hiện chuyển trạng thái bất hợp lệ và THROW lỗi 50004`;

          return {
            exactSql,
            targetDesc: `Phiếu sửa chữa: #${ticketId} | Trạng thái hiện tại: 'delivered' (Đã bàn giao khách)`,
            tables: [
              {
                tableName: "tickets",
                tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
                description: `Cố tình đảo ngược trạng thái từ 'delivered' về 'inspecting' (Trái quy trình một chiều)`,
                highlightColumns: ["status"],
                beforeRows: del,
              },
            ],
          };
        } else {
          const t = await this.dataSource.query(
            `SELECT TOP 1 id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE status NOT IN ('completed', 'delivered') AND technician_id IS NOT NULL ORDER BY id DESC`,
          );
          const ticketId = t?.[0]?.id || 1;
          const techId = t?.[0]?.technician_id || 2;
          const exactSql = `-- Mục tiêu: Hoàn tất sửa chữa phiếu #${ticketId} với kỹ thuật viên #${techId}\nUPDATE tickets\nSET status = 'completed', technician_id = ${techId}, updated_at = GETDATE()\nWHERE id = ${ticketId};\n-- Trigger tự động điền completed_at = GETDATE()`;

          return {
            exactSql,
            targetDesc: `Phiếu sửa chữa: #${ticketId} | Kỹ thuật viên: #${techId} | completed_at ban đầu: NULL`,
            tables: [
              {
                tableName: "tickets",
                tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
                description: `Cập nhật status = 'completed' -> Trigger tự động điền completed_at = GETDATE()`,
                highlightColumns: ["status", "technician_id", "completed_at"],
                beforeRows: t,
              },
            ],
          };
        }
      }

      case "trg_tickets_audit_history": {
        const t = await this.dataSource.query(
          `SELECT TOP 1 id, status, technician_id, updated_at FROM tickets WHERE status = 'received' ORDER BY id DESC`,
        );
        const ticketId = t?.[0]?.id || 1;
        const history = await this.dataSource.query(
          `SELECT TOP 5 id, ticket_id, old_status, new_status, technician_id, created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
          [ticketId],
        );
        const exactSql = `-- Mục tiêu: Cập nhật trạng thái phiếu #${ticketId} từ 'received' sang 'inspecting'\nUPDATE tickets\nSET status = 'inspecting', updated_at = GETDATE()\nWHERE id = ${ticketId};\n-- Trigger tự động ghi nhật ký chuyển trạng thái vào bảng ticket_status_history`;

        return {
          exactSql,
          targetDesc: `Phiếu sửa chữa: #${ticketId} | Trạng thái hiện tại: 'received' | Chuyển sang: 'inspecting'`,
          tables: [
            {
              tableName: "tickets",
              tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
              description: `Chuyển trạng thái phiếu từ 'received' sang 'inspecting'`,
              highlightColumns: ["status"],
              beforeRows: t,
            },
            {
              tableName: "ticket_status_history",
              tableTitle: `Bảng lịch sử kiểm toán được Trigger tự động ghi: ticket_status_history (Phiếu #${ticketId})`,
              description: `Trigger tự động INSERT bản ghi ghi nhận old_status = 'received' -> new_status = 'inspecting'`,
              highlightColumns: ["old_status", "new_status", "created_at"],
              beforeRows: history,
            },
          ],
        };
      }

      case "trg_invoice_items_freeze_paid": {
        const inv = await this.dataSource.query(
          `SELECT TOP 1 id, ticket_id, status, labor_fee, discount_amount, total_amount, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE status = 'paid' ORDER BY id DESC`,
        );
        const paidInvoiceId = inv?.[0]?.id || 1;
        const part = await this.dataSource.query(
          `SELECT TOP 1 id, part_name, price FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
        );
        const partId = part?.[0]?.id || 1;
        const partName = part?.[0]?.part_name || "Linh kiện";
        const unitPrice = Number(part?.[0]?.price || 50);

        const beforeInvoiceItems = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
          [paidInvoiceId],
        );

        const exactSql = `-- Mục tiêu: Cố tình chèn thêm linh kiện #${partId} (${partName}) vào Hóa đơn #${paidInvoiceId} đã thanh toán (status = 'paid')\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${paidInvoiceId}, ${partId}, 1, ${unitPrice.toFixed(2)});\n-- Trigger trg_invoice_items_freeze_paid (First) chặn lại với lỗi 50035`;

        return {
          exactSql,
          targetDesc: `Hóa đơn: #${paidInvoiceId} (ĐÃ THANH TOÁN: status = 'paid') | Linh kiện: #${partId} (${partName})`,
          tables: [
            {
              tableName: "invoice_items",
              tableTitle: `Bảng thao tác trực tiếp: invoice_items (Hóa đơn đã thanh toán #${paidInvoiceId})`,
              description: `Cố tình thêm linh kiện vào hóa đơn đã đóng băng thanh toán`,
              highlightColumns: ["quantity", "unit_price", "total_price"],
              beforeRows: beforeInvoiceItems,
            },
            {
              tableName: "invoices",
              tableTitle: `Bảng kiểm tra điều kiện đóng băng: invoices (Hóa đơn #${paidInvoiceId})`,
              description: `Hóa đơn đã thanh toán (status = 'paid') là bất biến, không cho phép sửa đổi linh kiện`,
              highlightColumns: ["status", "paid_at"],
              beforeRows: inv,
            },
          ],
        };
      }

      case "trg_invoices_freeze_paid_amounts": {
        const inv = await this.dataSource.query(
          `SELECT TOP 1 id, ticket_id, status, labor_fee, discount_amount, total_amount, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at, updated_at FROM invoices WHERE status = 'paid' ORDER BY id DESC`,
        );
        const paidInvoiceId = inv?.[0]?.id || 1;

        const exactSql = `-- Mục tiêu: Cố tình sửa đổi số tiền công labor_fee trên Hóa đơn #${paidInvoiceId} đã thanh toán (status = 'paid')\nUPDATE invoices\nSET labor_fee = labor_fee + 100.00\nWHERE id = ${paidInvoiceId};\n-- Trigger trg_invoices_freeze_paid_amounts chặn lại với lỗi 50036`;

        return {
          exactSql,
          targetDesc: `Hóa đơn: #${paidInvoiceId} (ĐÃ THANH TOÁN: status = 'paid') | Tiền công hiện tại: $${inv?.[0]?.labor_fee}`,
          tables: [
            {
              tableName: "invoices",
              tableTitle: `Bảng thao tác trực tiếp: invoices (Hóa đơn đã thanh toán #${paidInvoiceId})`,
              description: `Cố tình tăng labor_fee thêm $100 trên hóa đơn đã thanh toán (bất biến tài chính)`,
              highlightColumns: ["status", "labor_fee", "total_amount"],
              beforeRows: inv,
            },
          ],
        };
      }

      default:
        throw new BadRequestException(`Không tìm thấy trigger: ${triggerId}`);
    }
  }

  /**
   * Main entry point to test trigger events with concrete values.
   */
  async executeTriggerScenario(dto: {
    trigger_id: string;
    scenario_id: string;
    params?: Record<string, any>;
  }) {
    const { trigger_id, scenario_id, params = {} } = dto;

    switch (trigger_id) {
      case "trg_invoice_items_stock":
        return this.testInvoiceItemsStock(scenario_id, params);

      case "trg_invoices_total_amount":
        return this.testInvoicesTotalAmount(scenario_id, params);

      case "trg_invoices_labor_update":
        return this.testInvoicesLaborUpdate(scenario_id, params);

      case "trg_tickets_workflow_guard":
        return this.testTicketsWorkflowGuard(scenario_id, params);

      case "trg_tickets_audit_history":
        return this.testTicketsAuditHistory(scenario_id, params);

      case "trg_invoice_items_freeze_paid":
        return this.testInvoiceItemsFreezePaid(scenario_id, params);

      case "trg_invoices_freeze_paid_amounts":
        return this.testInvoicesFreezePaidAmounts(scenario_id, params);

      default:
        throw new BadRequestException(`Không tìm thấy trigger: ${trigger_id}`);
    }
  }

  /**
   * 1. trg_invoice_items_stock
   */
  private async testInvoiceItemsStock(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_invoice_items_stock";

    let partId = Number(params.part_id);
    if (!partId) {
      const p = await this.dataSource.query(
        `SELECT TOP 1 id, part_name, unit, price, stock_quantity FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
      );
      partId = p?.[0]?.id || 1;
    }

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(
        `SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
      );
      invoiceId = inv?.[0]?.id || 18;
    }

    const beforePart = await this.dataSource.query(
      `SELECT id, part_name, unit, price, stock_quantity, updated_at FROM parts WHERE id = @0`,
      [partId],
    );
    const beforeInvoiceItems = await this.dataSource.query(
      `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
      [invoiceId],
    );

    const currentStock = beforePart?.[0]?.stock_quantity ?? 10;
    const unitPrice = Number(beforePart?.[0]?.price ?? 50);
    const partName = beforePart?.[0]?.part_name ?? "Linh kiện";

    if (scenarioId === "stock_exceeded_fail") {
      const requestedQuantity = currentStock + 9999;
      const exactSql = `-- Mục tiêu: Thêm linh kiện #${partId} (${partName}) vào Hóa đơn #${invoiceId}\n-- Tồn kho hiện có: ${currentStock} cái | Số lượng yêu cầu: ${requestedQuantity} cái (VƯỢT TỒN KHO)\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, ${requestedQuantity}, ${unitPrice.toFixed(2)});`;

      try {
        await this.dataSource.query(
          `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, @2, @3)`,
          [invoiceId, partId, requestedQuantity, unitPrice],
        );
        return {
          success: true,
          stopped: false,
          triggerName,
          exactSql,
          message:
            "Thao tác thực hiện thành công bất ngờ mà không bị trigger chặn lại.",
        };
      } catch (err: any) {
        const reason =
          err.message || "Insufficient spare part inventory stock.";

        // Query fresh state to prove rollback preserved both tables
        const afterPart = await this.dataSource.query(
          `SELECT id, part_name, unit, price, stock_quantity, updated_at FROM parts WHERE id = @0`,
          [partId],
        );
        const afterInvoiceItems = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
          [invoiceId],
        );

        return {
          success: false,
          stopped: true,
          triggerName,
          reason,
          errorCode: err.number || 50001,
          exactSql,
          targetInfo: {
            part_id: partId,
            part_name: partName,
            current_stock: currentStock,
            requested_quantity: requestedQuantity,
            invoice_id: invoiceId,
          },
          tables: [
            {
              tableName: "invoice_items",
              tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
              description: `Bảng nhận thao tác INSERT`,
              highlightColumns: ["quantity", "unit_price", "total_price"],
              beforeRows: beforeInvoiceItems,
              afterRows: afterInvoiceItems,
              statusNote: `⛔ [ROLLBACK THÀNH CÔNG] Giao dịch bị hủy. Không có dòng linh kiện vượt tồn kho nào được chèn vào hóa đơn #${invoiceId}.`,
            },
            {
              tableName: "parts",
              tableTitle: `Bảng liên quan kiểm tra & trừ kho: parts (Linh kiện #${partId} - ${partName})`,
              description: `Bảng kiểm tra tồn kho`,
              highlightColumns: ["stock_quantity"],
              beforeRows: beforePart,
              afterRows: afterPart,
              statusNote: `🔒 [BẢO TOÀN TỒN KHO] Tồn kho linh kiện vẫn giữ nguyên ${currentStock} cái (hoàn toàn không bị trừ).`,
            },
          ],
          message: `${triggerName} đã chặn thao tác này do: ${reason}`,
        };
      }
    } else {
      const deductQuantity = 1;
      const exactSql = `-- Mục tiêu: Thêm linh kiện #${partId} (${partName}) vào Hóa đơn #${invoiceId}\n-- Tồn kho hiện có: ${currentStock} cái | Số lượng yêu cầu: 1 cái (HỢP LỆ)\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, ${deductQuantity}, ${unitPrice.toFixed(2)});`;

      try {
        await this.dataSource.query(
          `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, @2, @3)`,
          [invoiceId, partId, deductQuantity, unitPrice],
        );

        const afterPart = await this.dataSource.query(
          `SELECT id, part_name, unit, price, stock_quantity, updated_at FROM parts WHERE id = @0`,
          [partId],
        );
        const afterInvoiceItems = await this.dataSource.query(
          `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
          [invoiceId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          exactSql,
          targetInfo: {
            part_id: partId,
            part_name: partName,
            before_stock: currentStock,
            after_stock: afterPart?.[0]?.stock_quantity,
            deducted_quantity: deductQuantity,
            invoice_id: invoiceId,
          },
          tables: [
            {
              tableName: "invoice_items",
              tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
              description: `Đã chèn thêm thành công 1 linh kiện mới`,
              highlightColumns: ["quantity", "unit_price", "total_price"],
              beforeRows: beforeInvoiceItems,
              afterRows: afterInvoiceItems,
              statusNote: `✓ [ĐÃ CHÈN DÒNG MỚI] Linh kiện #${partId} đã được thêm vào chi tiết hóa đơn #${invoiceId}.`,
            },
            {
              tableName: "parts",
              tableTitle: `Bảng liên quan kiểm tra & trừ kho: parts (Linh kiện #${partId} - ${partName})`,
              description: `Trigger tự động trừ tồn kho`,
              highlightColumns: ["stock_quantity"],
              beforeRows: beforePart,
              afterRows: afterPart,
              statusNote: `✓ [TỰ ĐỘNG TRỪ TỒN KHO] Tồn kho linh kiện đã tự động giảm từ ${currentStock} xuống ${afterPart?.[0]?.stock_quantity}.`,
            },
          ],
          message: `Trigger ${triggerName} đã tự động giảm tồn kho của linh kiện #${partId} (${partName}) từ ${currentStock} xuống ${afterPart?.[0]?.stock_quantity}.`,
        };
      } catch (err: any) {
        return {
          success: false,
          stopped: true,
          triggerName,
          reason: err.message,
          exactSql,
          tables: [
            {
              tableName: "invoice_items",
              tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
              beforeRows: beforeInvoiceItems,
              afterRows: beforeInvoiceItems,
            },
          ],
          message: `${triggerName} đã chặn thao tác này do: ${err.message}`,
        };
      }
    }
  }

  /**
   * 2. trg_invoices_total_amount
   */
  private async testInvoicesTotalAmount(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_invoices_total_amount";

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(
        `SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
      );
      invoiceId = inv?.[0]?.id || 18;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE id = @0`,
      [invoiceId],
    );
    const beforeInvoiceItems = await this.dataSource.query(
      `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
      [invoiceId],
    );

    const part = await this.dataSource.query(
      `SELECT TOP 1 id, part_name, price, stock_quantity FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
    );
    const partId = part?.[0]?.id || 1;
    const unitPrice = Number(part?.[0]?.price || 100);
    const partName = part?.[0]?.part_name || "Linh kiện";
    const exactSql = `-- Mục tiêu: Thêm linh kiện #${partId} (${partName}, đơn giá: $${unitPrice.toFixed(2)}) vào Hóa đơn #${invoiceId}\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, 1, ${unitPrice.toFixed(2)});\n-- Trigger sẽ tự động tính lại invoices.total_amount = labor_fee + fn_calculate_parts_total`;

    try {
      await this.dataSource.query(
        `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, 1, @2)`,
        [invoiceId, partId, unitPrice],
      );

      const afterInvoice = await this.dataSource.query(
        `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE id = @0`,
        [invoiceId],
      );
      const afterInvoiceItems = await this.dataSource.query(
        `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
        [invoiceId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        exactSql,
        targetInfo: {
          invoice_id: invoiceId,
          part_id: partId,
          part_name: partName,
          added_amount: unitPrice,
          before_total: beforeInvoice?.[0]?.total_amount,
          after_total: afterInvoice?.[0]?.total_amount,
        },
        tables: [
          {
            tableName: "invoice_items",
            tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
            description: `Đã chèn 1 linh kiện mới vào hóa đơn`,
            highlightColumns: ["quantity", "unit_price", "total_price"],
            beforeRows: beforeInvoiceItems,
            afterRows: afterInvoiceItems,
            statusNote: `✓ [ĐÃ THÊM] Đã chèn thêm linh kiện #${partId} vào hóa đơn #${invoiceId}.`,
          },
          {
            tableName: "invoices",
            tableTitle: `Bảng liên quan Trigger tự động cập nhật: invoices (Hóa đơn #${invoiceId})`,
            description: `Trigger tự động tính toán lại total_amount`,
            highlightColumns: ["labor_fee", "discount_amount", "total_amount"],
            beforeRows: beforeInvoice,
            afterRows: afterInvoice,
            statusNote: `✓ [TỰ ĐỘNG TÍNH LẠI] Trigger tự động tính lại total_amount từ $${beforeInvoice?.[0]?.total_amount} lên $${afterInvoice?.[0]?.total_amount}.`,
          },
        ],
        message: `Trigger ${triggerName} đã tự động tính lại tổng tiền hóa đơn #${invoiceId}: Trước = $${beforeInvoice?.[0]?.total_amount}, Sau = $${afterInvoice?.[0]?.total_amount}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        stopped: true,
        triggerName,
        reason: err.message,
        exactSql,
        tables: [
          {
            tableName: "invoice_items",
            tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn #${invoiceId})`,
            beforeRows: beforeInvoiceItems,
            afterRows: beforeInvoiceItems,
          },
        ],
        message: `${triggerName} đã chặn thao tác này do: ${err.message}`,
      };
    }
  }

  /**
   * 3. trg_invoices_labor_update
   */
  private async testInvoicesLaborUpdate(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_invoices_labor_update";

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(
        `SELECT TOP 1 id FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`,
      );
      invoiceId = inv?.[0]?.id || 18;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE id = @0`,
      [invoiceId],
    );
    const beforeInvoiceItems = await this.dataSource.query(
      `SELECT id, invoice_id, part_id, quantity, unit_price, total_price FROM invoice_items WHERE invoice_id = @0`,
      [invoiceId],
    );

    const addFee = Number(params.labor_delta) || 50;
    const exactSql = `-- Mục tiêu: Cập nhật tăng tiền công labor_fee thêm $${addFee.toFixed(2)} trên Hóa đơn #${invoiceId}\nUPDATE invoices\nSET labor_fee = labor_fee + ${addFee.toFixed(2)}, updated_at = GETDATE()\nWHERE id = ${invoiceId};\n-- Trigger sẽ bắt sự kiện UPDATE(labor_fee) và tự động tính lại total_amount`;

    try {
      await this.dataSource.query(
        `UPDATE invoices SET labor_fee = labor_fee + @0, updated_at = GETDATE() WHERE id = @1`,
        [addFee, invoiceId],
      );

      const afterInvoice = await this.dataSource.query(
        `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, updated_at FROM invoices WHERE id = @0`,
        [invoiceId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        exactSql,
        targetInfo: {
          invoice_id: invoiceId,
          before_labor_fee: beforeInvoice?.[0]?.labor_fee,
          after_labor_fee: afterInvoice?.[0]?.labor_fee,
          before_total: beforeInvoice?.[0]?.total_amount,
          after_total: afterInvoice?.[0]?.total_amount,
        },
        tables: [
          {
            tableName: "invoices",
            tableTitle: `Bảng thao tác trực tiếp: invoices (Hóa đơn #${invoiceId})`,
            description: `Cập nhật labor_fee tăng $${addFee.toFixed(2)}`,
            highlightColumns: ["labor_fee", "total_amount"],
            beforeRows: beforeInvoice,
            afterRows: afterInvoice,
            statusNote: `✓ [TỰ ĐỘNG TÍNH LẠI] labor_fee tăng từ $${beforeInvoice?.[0]?.labor_fee} lên $${afterInvoice?.[0]?.labor_fee} -> Trigger tự động tính lại total_amount = $${afterInvoice?.[0]?.total_amount}.`,
          },
          {
            tableName: "invoice_items",
            tableTitle: `Bảng tham chiếu tiền linh kiện: invoice_items (Hóa đơn #${invoiceId})`,
            description: `Linh kiện giữ nguyên, tổng tiền thay đổi hoàn toàn do cập nhật tiền công`,
            highlightColumns: ["total_price"],
            beforeRows: beforeInvoiceItems,
            afterRows: beforeInvoiceItems,
            statusNote: `Tiền linh kiện trong hóa đơn cố định, không thay đổi.`,
          },
        ],
        message: `Trigger ${triggerName} đã tính lại tổng tiền: Tiền công đổi từ $${beforeInvoice?.[0]?.labor_fee} sang $${afterInvoice?.[0]?.labor_fee}, tổng tiền mới = $${afterInvoice?.[0]?.total_amount}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        stopped: true,
        triggerName,
        reason: err.message,
        exactSql,
        tables: [
          {
            tableName: "invoices",
            tableTitle: `Bảng thao tác trực tiếp: invoices (Hóa đơn #${invoiceId})`,
            beforeRows: beforeInvoice,
            afterRows: beforeInvoice,
          },
        ],
        message: `${triggerName} đã chặn thao tác này do: ${err.message}`,
      };
    }
  }

  /**
   * 4. trg_tickets_workflow_guard
   */
  private async testTicketsWorkflowGuard(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_tickets_workflow_guard";

    if (scenarioId === "guard_missing_technician") {
      let ticketId = Number(params.ticket_id);
      if (!ticketId) {
        const t = await this.dataSource.query(
          `SELECT TOP 1 id FROM tickets WHERE status = 'received' ORDER BY id DESC`,
        );
        ticketId = t?.[0]?.id || 1;
      }

      const beforeTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE id = @0`,
        [ticketId],
      );

      const exactSql = `-- Mục tiêu: Cố tình chuyển phiếu #${ticketId} sang 'repairing' mà KHÔNG phân công kỹ thuật viên\nUPDATE tickets\nSET status = 'repairing', technician_id = NULL\nWHERE id = ${ticketId};\n-- Trigger phát hiện technician_id IS NULL và THROW lỗi 50003`;

      try {
        await this.dataSource.query(
          `UPDATE tickets SET status = 'repairing', technician_id = NULL WHERE id = @0`,
          [ticketId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          exactSql,
          message:
            "Thao tác thực hiện thành công bất ngờ mà không bị trigger chặn lại.",
        };
      } catch (err: any) {
        const reason =
          err.message ||
          "A technician must be assigned before advancing to repairing or completed.";

        const afterTicket = await this.dataSource.query(
          `SELECT id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE id = @0`,
          [ticketId],
        );

        return {
          success: false,
          stopped: true,
          triggerName,
          reason,
          errorCode: err.number || 50003,
          exactSql,
          targetInfo: {
            ticket_id: ticketId,
            current_status: beforeTicket?.[0]?.status,
            attempted_status: "repairing",
            technician_id: null,
          },
          tables: [
            {
              tableName: "tickets",
              tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
              description: `Cố tình chuyển sang 'repairing' khi chưa có kỹ thuật viên`,
              highlightColumns: ["status", "technician_id"],
              beforeRows: beforeTicket,
              afterRows: afterTicket,
              statusNote: `⛔ [ROLLBACK THÀNH CÔNG] Giao dịch bị hủy. Phiếu #${ticketId} vẫn giữ nguyên trạng thái 'received' và technician_id = NULL.`,
            },
          ],
          message: `${triggerName} đã chặn thao tác này do: ${reason}`,
        };
      }
    } else if (scenarioId === "guard_invalid_transition") {
      const del = await this.dataSource.query(
        `SELECT TOP 1 id FROM tickets WHERE status = 'delivered' ORDER BY id DESC`,
      );
      const ticketId = del?.[0]?.id || 20;

      const beforeTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE id = @0`,
        [ticketId],
      );

      const exactSql = `-- Mục tiêu: Cố tình đảo ngược phiếu #${ticketId} đã 'delivered' về 'inspecting'\nUPDATE tickets\nSET status = 'inspecting'\nWHERE id = ${ticketId};\n-- Trigger phát hiện chuyển trạng thái bất hợp lệ và THROW lỗi 50004`;

      try {
        await this.dataSource.query(
          `UPDATE tickets SET status = 'inspecting' WHERE id = @0`,
          [ticketId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          exactSql,
          message:
            "Thao tác thực hiện thành công bất ngờ mà không bị trigger chặn lại.",
        };
      } catch (err: any) {
        const reason = err.message || "Invalid ticket status transition.";

        const afterTicket = await this.dataSource.query(
          `SELECT id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE id = @0`,
          [ticketId],
        );

        return {
          success: false,
          stopped: true,
          triggerName,
          reason,
          errorCode: err.number || 50004,
          exactSql,
          targetInfo: {
            ticket_id: ticketId,
            current_status: beforeTicket?.[0]?.status,
            attempted_status: "inspecting",
          },
          tables: [
            {
              tableName: "tickets",
              tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
              description: `Cố tình đảo ngược trạng thái từ 'delivered' về 'inspecting'`,
              highlightColumns: ["status"],
              beforeRows: beforeTicket,
              afterRows: afterTicket,
              statusNote: `⛔ [ROLLBACK THÀNH CÔNG] Giao dịch bị hủy. Phiếu #${ticketId} đã bàn giao không thể bị đảo ngược trạng thái.`,
            },
          ],
          message: `${triggerName} đã chặn thao tác này do: ${reason}`,
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
        const tech = await this.dataSource.query(
          `SELECT TOP 1 id FROM employees WHERE role = 'technician'`,
        );
        techId = tech?.[0]?.id || 1;
      }

      const beforeTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE id = @0`,
        [ticketId],
      );

      const exactSql = `-- Mục tiêu: Hoàn tất sửa chữa phiếu #${ticketId} với kỹ thuật viên #${techId}\nUPDATE tickets\nSET status = 'completed', technician_id = ${techId}, updated_at = GETDATE()\nWHERE id = ${ticketId};\n-- Trigger tự động gán completed_at = GETDATE()`;

      try {
        await this.dataSource.query(
          `UPDATE tickets SET status = 'completed', technician_id = @0, updated_at = GETDATE() WHERE id = @1`,
          [techId, ticketId],
        );

        const afterTicket = await this.dataSource.query(
          `SELECT id, status, technician_id, received_at, completed_at, updated_at FROM tickets WHERE id = @0`,
          [ticketId],
        );

        return {
          success: true,
          stopped: false,
          triggerName,
          exactSql,
          targetInfo: {
            ticket_id: ticketId,
            technician_id: techId,
            before_completed_at: beforeTicket?.[0]?.completed_at,
            after_completed_at: afterTicket?.[0]?.completed_at,
          },
          tables: [
            {
              tableName: "tickets",
              tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
              description: `Cập nhật status sang 'completed' -> Trigger tự động điền completed_at`,
              highlightColumns: ["status", "technician_id", "completed_at"],
              beforeRows: beforeTicket,
              afterRows: afterTicket,
              statusNote: `✓ [TỰ ĐỘNG GÁN TIMESTAMP] Trigger tự động gán completed_at = ${afterTicket?.[0]?.completed_at}.`,
            },
          ],
          message: `Trigger ${triggerName} đã tự động gán thời gian hoàn thành completed_at = ${afterTicket?.[0]?.completed_at}.`,
        };
      } catch (err: any) {
        return {
          success: false,
          stopped: true,
          triggerName,
          reason: err.message,
          exactSql,
          tables: [
            {
              tableName: "tickets",
              tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
              beforeRows: beforeTicket,
              afterRows: beforeTicket,
            },
          ],
          message: `${triggerName} đã chặn thao tác này do: ${err.message}`,
        };
      }
    }
  }

  /**
   * 5. trg_tickets_audit_history
   */
  private async testTicketsAuditHistory(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_tickets_audit_history";

    let ticketId = Number(params.ticket_id);
    if (!ticketId) {
      const t = await this.dataSource.query(
        `SELECT TOP 1 id FROM tickets WHERE status = 'received' ORDER BY id DESC`,
      );
      ticketId = t?.[0]?.id || 1;
    }

    const beforeTicket = await this.dataSource.query(
      `SELECT id, status, technician_id, updated_at FROM tickets WHERE id = @0`,
      [ticketId],
    );
    const beforeHistory = await this.dataSource.query(
      `SELECT TOP 5 id, ticket_id, old_status, new_status, technician_id, created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
      [ticketId],
    );

    const exactSql = `-- Mục tiêu: Cập nhật trạng thái phiếu #${ticketId} từ 'received' sang 'inspecting'\nUPDATE tickets\nSET status = 'inspecting', updated_at = GETDATE()\nWHERE id = ${ticketId};\n-- Trigger tự động ghi nhật ký vào bảng ticket_status_history`;

    try {
      await this.dataSource.query(
        `UPDATE tickets SET status = 'inspecting', updated_at = GETDATE() WHERE id = @0`,
        [ticketId],
      );

      const afterTicket = await this.dataSource.query(
        `SELECT id, status, technician_id, updated_at FROM tickets WHERE id = @0`,
        [ticketId],
      );
      const afterHistory = await this.dataSource.query(
        `SELECT TOP 5 id, ticket_id, old_status, new_status, technician_id, created_at FROM ticket_status_history WHERE ticket_id = @0 ORDER BY id DESC`,
        [ticketId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        exactSql,
        targetInfo: {
          ticket_id: ticketId,
          previous_audit_rows: beforeHistory.length,
          new_audit_rows: afterHistory.length,
        },
        tables: [
          {
            tableName: "tickets",
            tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
            description: `Cập nhật trạng thái phiếu từ 'received' sang 'inspecting'`,
            highlightColumns: ["status"],
            beforeRows: beforeTicket,
            afterRows: afterTicket,
            statusNote: `✓ [CẬP NHẬT TRẠNG THÁI] Phiếu #${ticketId} đã chuyển sang trạng thái 'inspecting'.`,
          },
          {
            tableName: "ticket_status_history",
            tableTitle: `Bảng liên quan được Trigger tự động ghi nhật ký: ticket_status_history (Phiếu #${ticketId})`,
            description: `Trigger tự động chèn bản ghi audit trail`,
            highlightColumns: ["old_status", "new_status", "created_at"],
            beforeRows: beforeHistory,
            afterRows: afterHistory,
            statusNote: `✓ [TỰ ĐỘNG GHI AUDIT LOG] Trigger đã tự động chèn một bản ghi mới với old_status = 'received', new_status = 'inspecting'.`,
          },
        ],
        message: `Trigger ${triggerName} đã tự động chèn thêm một bản ghi lịch sử kiểm toán với new_status = 'inspecting'.`,
      };
    } catch (err: any) {
      return {
        success: false,
        stopped: true,
        triggerName,
        reason: err.message,
        exactSql,
        tables: [
          {
            tableName: "tickets",
            tableTitle: `Bảng thao tác trực tiếp: tickets (Phiếu #${ticketId})`,
            beforeRows: beforeTicket,
            afterRows: beforeTicket,
          },
        ],
        message: `${triggerName} đã chặn thao tác này do: ${err.message}`,
      };
    }
  }

  /**
   * 6. trg_invoice_items_freeze_paid
   */
  private async testInvoiceItemsFreezePaid(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_invoice_items_freeze_paid";

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(
        `SELECT TOP 1 id FROM invoices WHERE status = 'paid' ORDER BY id DESC`,
      );
      invoiceId = inv?.[0]?.id || 1;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE id = @0`,
      [invoiceId],
    );
    const beforeInvoiceItems = await this.dataSource.query(
      `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
      [invoiceId],
    );

    const part = await this.dataSource.query(
      `SELECT TOP 1 id, part_name, price FROM parts WHERE stock_quantity > 0 ORDER BY id ASC`,
    );
    const partId = part?.[0]?.id || 1;
    const partName = part?.[0]?.part_name || "Linh kiện";
    const unitPrice = Number(part?.[0]?.price || 50);

    const exactSql = `-- Mục tiêu: Cố tình chèn thêm linh kiện #${partId} (${partName}) vào Hóa đơn #${invoiceId} đã thanh toán (status = 'paid')\nINSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price)\nVALUES (${invoiceId}, ${partId}, 1, ${unitPrice.toFixed(2)});\n-- Trigger trg_invoice_items_freeze_paid (chạy ưu tiên First) sẽ chặn lại với lỗi 50035`;

    try {
      await this.dataSource.query(
        `INSERT INTO invoice_items (invoice_id, part_id, quantity, unit_price) VALUES (@0, @1, 1, @2)`,
        [invoiceId, partId, unitPrice],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        exactSql,
        message:
          "Thao tác thực hiện thành công bất ngờ mà không bị trigger chặn lại.",
      };
    } catch (err: any) {
      const reason =
        err.message ||
        "Cannot add, modify, or remove spare parts on an already paid invoice.";

      const afterInvoice = await this.dataSource.query(
        `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at FROM invoices WHERE id = @0`,
        [invoiceId],
      );
      const afterInvoiceItems = await this.dataSource.query(
        `SELECT id, invoice_id, part_id, quantity, unit_price, total_price, created_at FROM invoice_items WHERE invoice_id = @0 ORDER BY id DESC`,
        [invoiceId],
      );

      return {
        success: false,
        stopped: true,
        triggerName,
        reason,
        errorCode: err.number || 50035,
        exactSql,
        targetInfo: {
          invoice_id: invoiceId,
          invoice_status: beforeInvoice?.[0]?.status,
          part_id: partId,
          part_name: partName,
        },
        tables: [
          {
            tableName: "invoice_items",
            tableTitle: `Bảng thao tác trực tiếp: invoice_items (Chi tiết Hóa đơn đã thanh toán #${invoiceId})`,
            description: `Cố tình thêm linh kiện vào hóa đơn đã đóng băng thanh toán`,
            highlightColumns: ["quantity", "unit_price", "total_price"],
            beforeRows: beforeInvoiceItems,
            afterRows: afterInvoiceItems,
            statusNote: `⛔ [ROLLBACK THÀNH CÔNG] Giao dịch bị hủy. Không có linh kiện nào được thêm vào hóa đơn đã thanh toán #${invoiceId}.`,
          },
          {
            tableName: "invoices",
            tableTitle: `Bảng kiểm tra điều kiện đóng băng: invoices (Hóa đơn #${invoiceId})`,
            description: `Hóa đơn đã thanh toán là bất biến`,
            highlightColumns: ["status", "paid_at"],
            beforeRows: beforeInvoice,
            afterRows: afterInvoice,
            statusNote: `🔒 [BẢO TOÀN TRẠNG THÁI] Hóa đơn vẫn giữ nguyên status = 'paid' và số tiền ban đầu.`,
          },
        ],
        message: `${triggerName} đã chặn thao tác này do: ${reason}`,
      };
    }
  }

  /**
   * 7. trg_invoices_freeze_paid_amounts
   */
  private async testInvoicesFreezePaidAmounts(
    scenarioId: string,
    params: Record<string, any>,
  ) {
    const triggerName = "trg_invoices_freeze_paid_amounts";

    let invoiceId = Number(params.invoice_id);
    if (!invoiceId) {
      const inv = await this.dataSource.query(
        `SELECT TOP 1 id FROM invoices WHERE status = 'paid' ORDER BY id DESC`,
      );
      invoiceId = inv?.[0]?.id || 1;
    }

    const beforeInvoice = await this.dataSource.query(
      `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at, updated_at FROM invoices WHERE id = @0`,
      [invoiceId],
    );

    const exactSql = `-- Mục tiêu: Cố tình sửa đổi số tiền công labor_fee trên Hóa đơn #${invoiceId} đã thanh toán (status = 'paid')\nUPDATE invoices\nSET labor_fee = labor_fee + 100.00\nWHERE id = ${invoiceId};\n-- Trigger trg_invoices_freeze_paid_amounts sẽ chặn lại với lỗi 50036`;

    try {
      await this.dataSource.query(
        `UPDATE invoices SET labor_fee = labor_fee + 100 WHERE id = @0`,
        [invoiceId],
      );

      return {
        success: true,
        stopped: false,
        triggerName,
        exactSql,
        message:
          "Thao tác thực hiện thành công bất ngờ mà không bị trigger chặn lại.",
      };
    } catch (err: any) {
      const reason =
        err.message ||
        "Financial data of a paid invoice is immutable and cannot be altered or reversed.";

      const afterInvoice = await this.dataSource.query(
        `SELECT id, ticket_id, status, labor_fee, discount_amount, total_amount, payment_method, FORMAT(paid_at, 'yyyy-MM-dd HH:mm') AS paid_at, updated_at FROM invoices WHERE id = @0`,
        [invoiceId],
      );

      return {
        success: false,
        stopped: true,
        triggerName,
        reason,
        errorCode: err.number || 50036,
        exactSql,
        targetInfo: {
          invoice_id: invoiceId,
          invoice_status: beforeInvoice?.[0]?.status,
          current_labor_fee: beforeInvoice?.[0]?.labor_fee,
          attempted_labor_fee: Number(beforeInvoice?.[0]?.labor_fee || 0) + 100,
        },
        tables: [
          {
            tableName: "invoices",
            tableTitle: `Bảng thao tác trực tiếp: invoices (Hóa đơn đã thanh toán #${invoiceId})`,
            description: `Cố tình tăng labor_fee thêm $100 trên hóa đơn đã thanh toán`,
            highlightColumns: ["status", "labor_fee", "total_amount"],
            beforeRows: beforeInvoice,
            afterRows: afterInvoice,
            statusNote: `⛔ [ROLLBACK THÀNH CÔNG] Giao dịch bị hủy. Tiền công labor_fee và tổng tiền total_amount của hóa đơn #${invoiceId} được bảo vệ nguyên vẹn.`,
          },
        ],
        message: `${triggerName} đã chặn thao tác này do: ${reason}`,
      };
    }
  }
}
