import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

export interface CursorTableComparison {
  tableName: string;
  tableTitle: string;
  description?: string;
  highlightColumns?: string[];
  beforeRows: Record<string, any>[];
  afterRows?: Record<string, any>[];
  statusNote?: string;
}

export interface CursorPreviewResult {
  exactSql: string;
  targetDesc: string;
  tables: CursorTableComparison[];
}

@Injectable()
export class CursorsService {
  private readonly logger = new Logger(CursorsService.name);

  constructor(private readonly dataSource: DataSource) {}

  getCatalog(): CursorCatalogItem[] {
    return [
      {
        id: 'sp_audit_invoices',
        name: 'Đối Soát Hóa Đơn Bằng Con Trỏ Duyệt Từng Dòng',
        sqlName: 'dbo.sp_audit_invoices',
        cursorName: 'cur_invoices CURSOR LOCAL FAST_FORWARD',
        cursorType: 'LOCAL FAST_FORWARD',
        description:
          'Duyệt row-by-row qua từng hóa đơn bằng con trỏ cur_invoices, tính toán tổng tiền kỳ vọng bằng hàm fn_calculate_parts_total, phát hiện các hóa đơn bị sai lệch số liệu và hỗ trợ tự động đối soát đồng bộ (@auto_fix = 1).',
        parameters: [
          {
            name: 'auto_fix',
            type: 'boolean',
            required: false,
            defaultValue: false,
            description: 'Nếu bật true, con trỏ sẽ tự động UPDATE cập nhật lại total_amount chính xác cho các hóa đơn sai lệch',
          },
        ],
      },
      {
        id: 'sp_alert_delayed_tickets',
        name: 'Quét & Cảnh Báo Phiếu Trễ Hạn Bằng Con Trỏ',
        sqlName: 'dbo.sp_alert_delayed_tickets',
        cursorName: 'cur_delayed_tickets CURSOR LOCAL FAST_FORWARD',
        cursorType: 'LOCAL FAST_FORWARD',
        description:
          'Sử dụng con trỏ cur_delayed_tickets duyệt qua danh sách các phiếu đang tiếp nhận/chẩn đoán/chờ linh kiện, tính số ngày quá hạn (DATEDIFF) vượt ngưỡng quy định và gom dữ liệu trả về bảng cảnh báo.',
        parameters: [
          {
            name: 'delay_days',
            type: 'number',
            required: false,
            defaultValue: 7,
            description: 'Ngưỡng số ngày trôi qua để xếp phiếu vào diện trễ tiến độ (mặc định 7 ngày)',
          },
        ],
      },
    ];
  }

  /**
   * Preview trạng thái bảng trước khi thực thi con trỏ
   */
  async getCursorPreview(cursorId: string, params: Record<string, any>): Promise<CursorPreviewResult> {
    switch (cursorId) {
      case 'sp_audit_invoices': {
        const autoFix = Boolean(params.auto_fix);
        const invoiceRows = await this.dataSource.query(`
          SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status,
                 dbo.fn_calculate_parts_total(id) AS calculated_parts_total,
                 (labor_fee + dbo.fn_calculate_parts_total(id) - discount_amount) AS formula_expected_total
          FROM invoices
          ORDER BY id ASC
        `);

        const exactSql = `-- Khởi tạo và duyệt con trỏ kiểm tra sai lệch số tiền từng hóa đơn
DECLARE @discrepancies INT;
EXEC dbo.sp_audit_invoices @auto_fix = ${autoFix ? 1 : 0};
-- Con trỏ: cur_invoices CURSOR LOCAL FAST_FORWARD FOR SELECT id, labor_fee, discount_amount, total_amount FROM invoices;`;

        return {
          exactSql,
          targetDesc: `Con trỏ: cur_invoices | Bảng: invoices (${invoiceRows.length} hóa đơn) | Chế độ sửa: ${autoFix ? 'TỰ ĐỘNG UPDATE (@auto_fix = 1)' : 'CHỈ KIỂM TRA (@auto_fix = 0)'}`,
          tables: [
            {
              tableName: 'invoices',
              tableTitle: 'Bảng đối soát hóa đơn: invoices (Trước khi con trỏ duyệt)',
              description: 'Dữ liệu toàn bộ hóa đơn hiện tại: So sánh giữa total_amount thực tế và formula_expected_total',
              highlightColumns: ['total_amount', 'formula_expected_total'],
              beforeRows: invoiceRows,
            },
          ],
        };
      }

      case 'sp_alert_delayed_tickets': {
        const delayDays = Number(params.delay_days ?? 7);
        const candidateRows = await this.dataSource.query(`
          SELECT t.id, t.status, d.device_name, c.full_name AS customer_name,
                 FORMAT(t.received_at, 'yyyy-MM-dd') AS received_date,
                 DATEDIFF(DAY, t.received_at, GETDATE()) AS days_elapsed
          FROM tickets t
          JOIN devices d ON d.id = t.device_id
          JOIN customers c ON c.id = d.customer_id
          WHERE t.status NOT IN ('completed', 'delivered', 'cancelled')
          ORDER BY t.received_at ASC
        `);

        const exactSql = `-- Mở con trỏ quét phiếu quá hạn vượt ${delayDays} ngày
EXEC dbo.sp_alert_delayed_tickets @delay_days = ${delayDays};
-- Con trỏ: cur_delayed_tickets CURSOR LOCAL FAST_FORWARD FOR SELECT ... WHERE DATEDIFF(DAY, received_at, GETDATE()) > ${delayDays};`;

        return {
          exactSql,
          targetDesc: `Con trỏ: cur_delayed_tickets | ${candidateRows.length} phiếu chưa hoàn thành | Ngưỡng trễ: > ${delayDays} ngày`,
          tables: [
            {
              tableName: 'tickets',
              tableTitle: 'Bảng ứng viên duyệt con trỏ: tickets (Phiếu đang xử lý)',
              description: 'Danh sách các phiếu chưa đóng mà con trỏ cur_delayed_tickets sẽ duyệt từng dòng để kiểm tra DATEDIFF',
              highlightColumns: ['status', 'days_elapsed'],
              beforeRows: candidateRows,
            },
          ],
        };
      }

      default:
        throw new BadRequestException(`Không tìm thấy cursor: ${cursorId}`);
    }
  }

  /**
   * Tạo tình huống sai lệch số tiền để demo con trỏ tự động sửa
   */
  async simulateDiscrepancy() {
    const inv = await this.dataSource.query(`SELECT TOP 1 id, total_amount FROM invoices WHERE status = 'unpaid' ORDER BY id DESC`);
    if (!inv || !inv[0]) {
      throw new BadRequestException('Không tìm thấy hóa đơn unpaid nào để tạo sai lệch thử nghiệm.');
    }

    const id = inv[0].id;
    // Cố tình làm lệch $100 trên total_amount
    await this.dataSource.query(`UPDATE invoices SET total_amount = total_amount - 100.00 WHERE id = @0`, [id]);

    const updated = await this.dataSource.query(`
      SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status,
             dbo.fn_calculate_parts_total(id) AS calculated_parts_total,
             (labor_fee + dbo.fn_calculate_parts_total(id) - discount_amount) AS formula_expected_total
      FROM invoices WHERE id = @0
    `, [id]);

    return {
      success: true,
      invoiceId: id,
      message: `Đã cố tình trừ $100.00 trên Hóa đơn #${id} để tạo sai lệch dữ liệu! Bây giờ hãy chạy con trỏ sp_audit_invoices với auto_fix = true để xem con trỏ tự động sửa lại.`,
      invoice: updated?.[0],
    };
  }

  /**
   * 1. sp_audit_invoices (Cursor)
   */
  async executeAuditInvoices(dto: { auto_fix?: boolean }) {
    const autoFix = Boolean(dto.auto_fix);

    const beforeInvoices = await this.dataSource.query(`
      SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status,
             dbo.fn_calculate_parts_total(id) AS calculated_parts_total,
             (labor_fee + dbo.fn_calculate_parts_total(id) - discount_amount) AS formula_expected_total
      FROM invoices
      ORDER BY id ASC
    `);

    const exactSql = `-- Khởi tạo và thực thi con trỏ kiểm toán hóa đơn
EXEC dbo.sp_audit_invoices @auto_fix = ${autoFix ? 1 : 0};`;

    const callSql = `EXEC dbo.sp_audit_invoices @auto_fix = @0;`;
    const resultRows = await this.dataSource.query(callSql, [autoFix ? 1 : 0]);
    const summary = resultRows?.[0] || { discrepancies_found: 0, was_auto_fixed: autoFix ? 1 : 0 };

    const afterInvoices = await this.dataSource.query(`
      SELECT id, ticket_id, labor_fee, discount_amount, total_amount, status,
             dbo.fn_calculate_parts_total(id) AS calculated_parts_total,
             (labor_fee + dbo.fn_calculate_parts_total(id) - discount_amount) AS formula_expected_total
      FROM invoices
      ORDER BY id ASC
    `);

    const discCount = Number(summary.discrepancies_found || 0);

    return {
      procedure: 'dbo.sp_audit_invoices',
      cursorUsed: 'cur_invoices LOCAL FAST_FORWARD',
      exactSql,
      result: {
        discrepancies_found: discCount,
        was_auto_fixed: Boolean(summary.was_auto_fixed),
      },
      tables: [
        {
          tableName: 'invoices',
          tableTitle: 'Bảng đối soát hóa đơn: invoices',
          description: autoFix
            ? 'Con trỏ cur_invoices đã duyệt từng dòng và tự động UPDATE các hóa đơn sai lệch khớp với công thức'
            : 'Chế độ chỉ kiểm tra: Con trỏ duyệt từng dòng để phát hiện sai lệch mà không sửa',
          highlightColumns: ['total_amount', 'formula_expected_total'],
          beforeRows: beforeInvoices,
          afterRows: afterInvoices,
          statusNote: autoFix
            ? `✓ [CON TRỎ ĐÃ SỬA TỰ ĐỘNG] Con trỏ đã phát hiện ${discCount} hóa đơn sai lệch và đồng bộ lại tổng tiền khớp 100% với công thức tính.`
            : `ℹ [CHẾ ĐỘ CHỈ KIỂM TRA] Con trỏ phát hiện ${discCount} hóa đơn sai lệch. Bật tuỳ chọn auto_fix để con trỏ tự động sửa.`,
        },
      ],
      before: beforeInvoices,
      after: afterInvoices,
      message: autoFix
        ? `Con trỏ đã duyệt xong toàn bộ bảng invoices: Phát hiện ${discCount} sai lệch và đã tự động UPDATE đồng bộ lại dữ liệu!`
        : `Con trỏ đã duyệt xong: Phát hiện ${discCount} hóa đơn bị sai lệch số liệu.`,
    };
  }

  /**
   * 2. sp_alert_delayed_tickets (Cursor)
   */
  async executeAlertDelayedTickets(dto: { delay_days?: number }) {
    const delayDays = dto.delay_days ?? 7;

    const beforeTickets = await this.dataSource.query(
      `SELECT t.id, FORMAT(t.received_at, 'yyyy-MM-dd') AS received_at, DATEDIFF(DAY, t.received_at, GETDATE()) AS days_elapsed,
              t.status, d.device_name, c.full_name AS customer_name
       FROM tickets t
       JOIN devices d ON d.id = t.device_id
       JOIN customers c ON c.id = d.customer_id
       WHERE t.status NOT IN ('completed', 'delivered', 'cancelled')
       ORDER BY t.received_at ASC`,
    );

    const exactSql = `EXEC dbo.sp_alert_delayed_tickets @delay_days = ${delayDays};`;
    const callSql = `EXEC dbo.sp_alert_delayed_tickets @delay_days = @0;`;
    const delayedTickets = await this.dataSource.query(callSql, [delayDays]);

    return {
      procedure: 'dbo.sp_alert_delayed_tickets',
      cursorUsed: 'cur_delayed_tickets LOCAL FAST_FORWARD',
      delayDays,
      exactSql,
      totalOverdueFound: delayedTickets.length,
      tables: [
        {
          tableName: 'tickets',
          tableTitle: 'Bảng ứng viên quét: tickets (Các phiếu đang mở)',
          description: 'Danh sách các phiếu đang xử lý mà con trỏ cur_delayed_tickets sẽ duyệt từng dòng',
          highlightColumns: ['status', 'days_elapsed'],
          beforeRows: beforeTickets,
          afterRows: beforeTickets,
          statusNote: `ℹ Toàn bộ ${beforeTickets.length} phiếu chưa hoàn tất được đưa vào con trỏ cur_delayed_tickets để tính DATEDIFF.`,
        },
        {
          tableName: 'delayed_tickets',
          tableTitle: `Bảng kết quả con trỏ gom lại: delayed_tickets (Quá hạn > ${delayDays} ngày)`,
          description: 'Các phiếu trôi qua nhiều hơn ngưỡng quy định được con trỏ chèn vào bảng tạm kết quả',
          highlightColumns: ['ticket_id', 'overdue_days', 'assigned_technician'],
          beforeRows: [],
          afterRows: delayedTickets,
          statusNote: `✓ [CON TRỎ ĐÃ LỌC RA] Phát hiện ${delayedTickets.length} phiếu quá hạn trên ngưỡng ${delayDays} ngày.`,
        },
      ],
      before: beforeTickets,
      after: delayedTickets,
      message: `Con trỏ đã duyệt xong: Lọc được ${delayedTickets.length} phiếu sửa chữa trễ tiến độ quá ${delayDays} ngày.`,
    };
  }
}
