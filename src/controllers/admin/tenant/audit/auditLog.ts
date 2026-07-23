// controllers/admin/audit/auditLog.ts
import { Request, Response } from "express";
import { httpStatusCode } from "../../../../lib/constant";
import { errorParser } from "../../../../lib/errors/error-response-handler";
import { getAuditLogsService } from "../../../../services/admin/tenant/audit/auditLog";

// ============================================
// AUDIT LOG CONTROLLERS
// ============================================

/**
 * Get all audit logs with pagination and filters
 */
export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const response = await getAuditLogsService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        });
    }
};