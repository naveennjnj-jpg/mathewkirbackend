// controllers/user/user.ts
import { Request, Response } from "express"
import { httpStatusCode } from "../../lib/constant"
import { errorParser } from "../../lib/errors/error-response-handler"
import { clientSignupSchema, passswordResetSchema } from "../../validation/client-user"
import { formatZodErrors } from "../../validation/format-zod-errors"
import { 
    loginService, 
    userdataServive, 
    forgotPasswordService, 
    verifyPasswordResetService,
    getDashboardStatsService, 
    updateAPasswordService,
    getPlatformSettingService,
    updatePlatformSettingService,
    getTenantDomainDataService
} from "../../services/user/user"
import { z } from "zod"
import mongoose from "mongoose"


export const userdata = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).currentUser
        const result = await userdataServive({ userId })
        
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

export const login = async (req: Request, res: Response) => {
    try {
        const result = await loginService(req.body)
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.UNAUTHORIZED).json({
                success: false,
                message: result.message
            })
        }

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: result.message,
            data: result.data,
            token: result.token
        })
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: message || "An error occurred" 
        })
    }
}

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const result = await forgotPasswordService(req.body)
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
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

export const verifyPasswordReset = async (req: Request, res: Response) => {
    try {
        const result = await verifyPasswordResetService(req.body)
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
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

export const updateAPassword = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).currentUser
        const result = await updateAPasswordService({ userId, body: req.body })
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
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

export const profileupdate = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: 'No file uploaded',
            })
        }

        const imageUrl = "/" + (req.file as any).path.replace(/^public\//, "");
        const publicId = (req.file as any).filename

        return res.status(httpStatusCode.OK).json({
            success: true,
            message: 'Uploaded successfully',
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

export const getPlatformSetting = async (req: Request, res: Response) => {
    try {
        const result = await getPlatformSettingService(req)
        
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

export const updatePlatformSetting = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).currentUser
        const result = await updatePlatformSettingService({ userId, body: req.body })
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
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


export const getTenantDomainData = async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;

    const result = await getTenantDomainDataService(subdomain);

    if (!result.success) {
      return res.status(result.code || 404).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};