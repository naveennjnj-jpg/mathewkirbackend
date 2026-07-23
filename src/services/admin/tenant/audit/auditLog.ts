// services/admin/audit/auditLog.ts
import { Request, Response } from "express";
import prisma from "../../../../lib/prisma";
import { errorResponseHandler } from "../../../../lib/errors/error-response-handler";
import { httpStatusCode } from "../../../../lib/constant";

// ============================================
// TYPES
// ============================================

interface AuditLogQueryParams {
  page?: number;
  limit?: number;
  tenantId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// GET AUDIT LOGS SERVICE
// ============================================

/**
 * Get all audit logs with pagination and filters
 */
export const getAuditLogsService = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      tenantId,
      userId,
      action,
      entityType,
      startDate,
      endDate,
      search = '',
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query as AuditLogQueryParams;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause
    let where: any = {};

    if (tenantId && tenantId !== 'all') {
      where.tenant_id = tenantId;
    }

    if (userId && userId !== 'all') {
      where.user_id = userId;
    }

    if (action && action !== 'all') {
      where.action = action;
    }

    if (entityType && entityType !== 'all') {
      where.entity_type = entityType;
    }

    if (startDate) {
      where.created_at = {
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.created_at = {
        ...where.created_at,
        lte: new Date(endDate),
      };
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity_type: { contains: search, mode: 'insensitive' } },
        {
          user: {
            email: { contains: search, mode: 'insensitive' },
          },
        },
        {
          user: {
            full_name: { contains: search, mode: 'insensitive' },
          },
        },
        {
          tenant: {
            name: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    // Get total count
    const total = await prisma.auditLog.count({ where });

    // Get audit logs with related data
    const auditLogs = await prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: {
        [sortBy]: sortOrder,
      },
      include: {
        tenant: {
          select: {
            tenant_id: true,
            name: true,
            subdomain: true,
          },
        },
        user: {
          select: {
            user_id: true,
            email: true,
            full_name: true,
          },
        },
      },
    });

    // Format audit logs
    const formattedLogs = auditLogs.map((log) => {
      // Determine status from details or default to 'success'
      const logStatus = log.details?.status || 'success';

      return {
        id: log.log_id,
        timestamp: log.created_at,
        tenant: log.tenant?.name || 'Unknown Tenant',
        tenantId: log.tenant_id,
        user: log.user?.full_name || 'Unknown User',
        userEmail: log.user?.email || 'Unknown Email',
        userId: log.user_id,
        action: log.action || 'unknown',
        entityType: log.entity_type || 'unknown',
        entityId: log.entity_id,
        details: log.details || {},
        status: logStatus,
        createdAt: log.created_at,
      };
    });

    // Get summary stats (success/failed counts)
    const successCount = await prisma.auditLog.count({
      where: {
        ...where,
        details: {
          path: ['status'],
          equals: 'success',
        },
      },
    });

    const failedCount = await prisma.auditLog.count({
      where: {
        ...where,
        details: {
          path: ['status'],
          equals: 'failed',
        },
      },
    });

    return {
      success: true,
      message: "Audit logs fetched successfully",
      data: formattedLogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
      summary: {
        total: formattedLogs.length,
        success: successCount,
        failed: failedCount,
      },
    };
  } catch (error: any) {
    console.error("Get audit logs error:", error);
    return errorResponseHandler(
      error.message || "Failed to fetch audit logs",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};