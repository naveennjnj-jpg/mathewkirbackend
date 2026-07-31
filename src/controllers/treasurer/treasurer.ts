// controllers/user/user.ts
import { Request, Response } from "express"
import { httpStatusCode } from "../../lib/constant"
import { errorParser } from "../../lib/errors/error-response-handler"
import { clientSignupSchema, passswordResetSchema } from "../../validation/client-user"
import { formatZodErrors } from "../../validation/format-zod-errors"
import {
    getDashboardStatsService,
    getMembersService,
    addMemberService,
    updateMemberService,
    deleteMemberService,
    importMembersService,
    getAllPaymentsService,
    updatePaymentStatusService,
    getPayoutsService,
    createPayoutService,
    updatePayoutService,
    deletePayoutService,
    generateReportService,
    exportReportService,
    getAnalyticsStatService
} from "../../services/treasurer/treasurer"
import { z } from "zod"
import mongoose from "mongoose"


/**
 * Get all members
 */
export const getMembers = async (req: Request, res: Response) => {
    try {
        const result = await getMembersService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

/**
 * Add a new member
 */
export const addMember = async (req: Request, res: Response) => {
    try {
        const result = await addMemberService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.CREATED).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

/**
 * Update a member
 */
export const updateMember = async (req: Request, res: Response) => {
    try {
        const result = await updateMemberService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

/**
 * Delete a member
 */
export const deleteMember = async (req: Request, res: Response) => {
    try {
        const result = await deleteMemberService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

/**
 * Import members from CSV
 */
export const importMembers = async (req: Request, res: Response) => {
    try {
        const result = await importMembersService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}


export const profileupdate = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: 'No file uploaded',
            })
        }

        const imageUrl = (req.file as any).path
        const publicId = (req.file as any).filename

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: 'Profile image uploaded successfully',
            data: {
                imageUrl: imageUrl,
                publicId: publicId,
            },
        })
    } catch (error: any) {
        console.error('Profile upload error:', error)
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || 'Failed to upload profile image'
        })
    }
}

export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const result = await getDashboardStatsService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}


export const getAnalyticsStat = async (req: Request, res: Response) => {
    try {
        const result = await getAnalyticsStatService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}




export const getAllPayments = async (req: Request, res: Response) => {
    try {
        const result = await getAllPaymentsService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

export const updatePaymentStatus = async (req: Request, res: Response) => {
    try {
        const result = await updatePaymentStatusService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

export const getPayouts = async (req: Request, res: Response) => {
    try {
        const result = await getPayoutsService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

export const createPayout = async (req: Request, res: Response) => {
    try {
        const result = await createPayoutService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.CREATED).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

export const updatePayout = async (req: Request, res: Response) => {
    try {
        const result = await updatePayoutService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

export const deletePayout = async (req: Request, res: Response) => {
    try {
        const result = await deletePayoutService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.NOT_FOUND).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}

export const generateReport = async (req: Request, res: Response) => {
    try {
        const result = await generateReportService(req)

        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred"
        })
    }
}


export const exportReport = async (req: Request, res: Response) => {
    try {
        const result = await exportReportService(req)
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message
            })
        }

        const { fileData, contentType, fileName } = result.data;

        // Set appropriate headers for file download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', fileData.length);
        res.setHeader('Cache-Control', 'no-cache');
        
        return res.send(fileData);
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: message || "An error occurred" 
        })
    }
};