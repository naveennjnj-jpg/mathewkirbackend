// controllers/member/member.ts
import { Request, Response } from "express"
import { httpStatusCode } from "../../lib/constant"
import { errorParser } from "../../lib/errors/error-response-handler"
import { clientSignupSchema, passswordResetSchema } from "../../validation/client-user"
import { formatZodErrors } from "../../validation/format-zod-errors"
import {
    getDashboardStatsService,
    getContributionsService,
    getEventsService,
    submitPaymentService,
    getBeneficiariesService,
    createBeneficiaryService,
    updateBeneficiaryService,
    deleteBeneficiaryService
} from "../../services/member/member"
import { z } from "zod"
import mongoose from "mongoose"


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


export const getContributions = async (req: Request, res: Response) => {
    try {
        const result = await getContributionsService(req)

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


export const getEvents = async (req: Request, res: Response) => {
    try {
        const result = await getEventsService(req)

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


export const submitPayment = async (req: Request, res: Response) => {
    try {
        const result = await submitPaymentService(req)

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

export const getBeneficiaries = async (req: Request, res: Response) => {
    try {
        const result = await getBeneficiariesService(req)

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

export const createBeneficiary = async (req: Request, res: Response) => {
    try {
        const result = await createBeneficiaryService(req)

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

export const updateBeneficiary = async (req: Request, res: Response) => {
    try {
        const result = await updateBeneficiaryService(req)

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

export const deleteBeneficiary = async (req: Request, res: Response) => {
    try {
        const result = await deleteBeneficiaryService(req)

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