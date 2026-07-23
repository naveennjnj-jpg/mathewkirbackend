// controllers/treasurer/events.ts
import { Request, Response } from "express"
import { httpStatusCode } from "../../lib/constant"
import { errorParser } from "../../lib/errors/error-response-handler"
import {
    createEventService,
    getEventsService,
    getEventByIdService,
    updateEventService,
    deleteEventService,
    getEventSummaryService
} from "../../services/treasurer/events"

/**
 * Create a new event
 */
export const createEvent = async (req: Request, res: Response) => {
    try {
        // Log request body for debugging
        console.log('📝 Create Event Request:')
        console.log('Body:', req.body)
        console.log('Files:', req.file)
        
        const result = await createEventService(req)
        
        if (!result.success) {
            return res.status(result.code || httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: result.message,
                debug: result.debug // Include debug info if available
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
 * Get all events
 */
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
            data: result.data,
            pagination: result.pagination
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
 * Get event by ID
 */
export const getEventById = async (req: Request, res: Response) => {
    try {
        const result = await getEventByIdService(req)
        
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
 * Update event
 */
export const updateEvent = async (req: Request, res: Response) => {
    try {
        const result = await updateEventService(req)
        
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
 * Delete event
 */
export const deleteEvent = async (req: Request, res: Response) => {
    try {
        const result = await deleteEventService(req)
        
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
 * Get event summary
 */
export const getEventSummary = async (req: Request, res: Response) => {
    try {
        const result = await getEventSummaryService(req)
        
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