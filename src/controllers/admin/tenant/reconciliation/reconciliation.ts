// controllers/admin/reconciliation/reconciliation.ts
import { Request, Response } from "express";
import { httpStatusCode } from "../../../../lib/constant";
import { errorParser } from "../../../../lib/errors/error-response-handler";
import { getAllTransactionsService } from "../../../../services/admin/reconciliation/reconciliation";

/**
 * Get all transactions (no filters applied)
 */
export const getAllTransactions = async (req: Request, res: Response) => {
  try {
    const result = await getAllTransactionsService(req);
    
    if (!result.success) {
      return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: result.message
      });
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred"
    });
  }
};