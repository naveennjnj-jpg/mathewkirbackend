// controllers/admin/user/user.ts
import { Request, Response } from "express";
import { httpStatusCode } from "../../../../lib/constant";
import { errorParser } from "../../../../lib/errors/error-response-handler";
import {
  getAllUsersService,
  getUserByIdService,
  createUserService,
  updateUserService,
  deleteUserService,
  updateUserStatusService,
  getUserStatsService
} from "../../../../services/admin/tenant/user/user";

// ============================================
// USER CONTROLLERS
// ============================================

/**
 * Get all users
 */
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const result = await getAllUsersService(req);
    
    if (!result.success) {
      return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: result.message
      });
    }

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: result.message,
      data: result.data,
      pagination: result.pagination,
      filters: result.filters
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred"
    });
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate that ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid user ID format. Must be a valid UUID."
      });
    }
    
    const result = await getUserByIdService(id);
    
    if (!result.success) {
      return res.status(result.code || httpStatusCode.NOT_FOUND).json({
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

/**
 * Create new user
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const result = await createUserService(req);
    
    if (!result.success) {
      return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: result.message
      });
    }

    return res.status(httpStatusCode.CREATED).json({
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

/**
 * Update user
 */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate that ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid user ID format. Must be a valid UUID."
      });
    }
    
    const userId = (req as any).currentUser;
    const result = await updateUserService({ id, userId, body: req.body });
    
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

/**
 * Delete user
 */
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate that ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid user ID format. Must be a valid UUID."
      });
    }
    
    const userId = (req as any).currentUser;
    const result = await deleteUserService({ id, userId });
    
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

/**
 * Update user status
 */
export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate that ID is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Invalid user ID format. Must be a valid UUID."
      });
    }
    
    const userId = (req as any).currentUser;
    const { status, tenantId } = req.body;
    const result = await updateUserStatusService({ id, userId, status, tenantId });
    
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

/**
 * Get user statistics
 */
export const getUserStats = async (req: Request, res: Response) => {
  try {
    const result = await getUserStatsService();
    
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