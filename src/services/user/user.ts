// services/user/user.ts
import { Request } from "express"
import bcrypt from "bcryptjs"
import jwt, { JwtPayload } from 'jsonwebtoken'
import { customAlphabet } from "nanoid"
import prisma from "../../lib/prisma"
import { httpStatusCode } from "../../lib/constant"
import { sendPasswordResetEmail } from "../../utils/mails/mail"
import { generateAuthToken, hashPassword, comparePassword, generateNumericOTP } from "../../utils/auth-utils"

// ============================================
// TYPES
// ============================================

interface SignupPayload {
    email: string
    password: string
    fullName?: string
    phoneNumber?: string
}

interface LoginPayload {
    email: string
    password: string
}

interface UpdateUserPayload {
    userId: string
    body: any
}

interface UpdatePasswordPayload {
    userId: string
    body: {
        currentPassword?: string
        newPassword?: string
        confirmPassword?: string
    }
}

interface ForgotPasswordPayload {
    email: string
}

interface VerifyOTPPayload {
    email: string
    otp: string
}

interface ResetPasswordWithOTPPayload {
    email: string
    otp: string
    newPassword: string
    confirmPassword: string
}

interface VerifyPasswordResetPayload {
    token: string
    newPassword: string
    confirmPassword: string
}

// ============================================
// AUTH SERVICES
// ============================================

/**
 * Signup Service
 */
export const signupService = async (payload: SignupPayload) => {
    try {
        const { email, password, fullName, phoneNumber } = payload
        const normalizedEmail = email.toLowerCase().trim()

        // Validate password length
        if (!password || password.length < 8) {
            return {
                success: false,
                message: "Password must be at least 8 characters",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Check if email exists
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        })

        if (existingUser) {
            return {
                success: false,
                message: "Email already exists",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Hash password
        const hashedPassword = await hashPassword(password)

        // Create user
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password_hash: hashedPassword,
                full_name: fullName || null,
                phone: phoneNumber || null,
                created_at: new Date()
            }
        })

        // Generate token
        const token = generateAuthToken({
            id: user.user_id,
            email: user.email,
            role: 'user'
        })

        // Remove sensitive data
        const { password_hash, reset_token, reset_token_expires, reset_otp, reset_otp_expires, ...userData } = user

        return {
            success: true,
            message: "User signup successful",
            data: {
                user: userData
            },
            token
        }

    } catch (error: any) {
        console.error("Signup error:", error)
        return {
            success: false,
            message: error.message || "Failed to create user",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Login Service
 */
export const loginService = async (payload: LoginPayload) => {
    try {
        const { email, password } = payload
        // console.log("emial",email)
        // console.log("password",password)
        const normalizedEmail = email.toLowerCase().trim()

        // Find user
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            include: {
                memberships: {
                    include: {
                        tenant: true
                    }
                }
            }
        })

        if (!user) {
            return {
                success: false,
                message: "Invalid credentials",
                code: httpStatusCode.UNAUTHORIZED
            }
        }

        // Verify password
        const isValidPassword = await comparePassword(password, user.password_hash)
        if (!isValidPassword) {
            return {
                success: false,
                message: "Invalid credentials",
                code: httpStatusCode.UNAUTHORIZED
            }
        }

        // Determine role — super-admin check FIRST (tenant-less, global role)
        let primaryRole = "member"

        if (user.is_super_admin) {
            primaryRole = "admin"
        } else if (user.memberships.length > 0) {
            const roles = user.memberships.map((m) => m.role)

            if (roles.includes("treasurer")) {
                primaryRole = "treasurer"
            } else if (roles.includes("member")) {
                primaryRole = "member"
            } else {
                primaryRole = roles[0]
            }
        }

        // Generate token
        const token = generateAuthToken({
            id: user.user_id,
            email: user.email,
            role: primaryRole
        })

        // Remove sensitive data (only fields that actually exist on User now)
        const { password_hash, ...userData } = user

        return {
            success: true,
            message: "Login successful",
            data: {
                user: userData,
                role: primaryRole,
                tenants: user.memberships.map(m => ({
                    id: m.tenant_id,
                    name: m.tenant.name,
                    subdomain: m.tenant.subdomain,
                    role: m.role,
                    status: m.tenant.status
                }))
            },
            token
        }

    } catch (error: any) {
        console.error("Login error:", error)
        return {
            success: false,
            message: error.message || "Failed to login",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Get User Data Service
 */
export const userdataServive = async (payload: { userId: string }) => {
    try {
        const { userId } = payload

        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    include: {
                        tenant: true
                    }
                }
            }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Determine role (same as loginService)
        let primaryRole = "member"

        if (user.is_super_admin) {
            primaryRole = "admin"
        } else if (user.memberships.length > 0) {
            const roles = user.memberships.map((m) => m.role)

            if (roles.includes("treasurer")) {
                primaryRole = "treasurer"
            } else if (roles.includes("member")) {
                primaryRole = "member"
            } else {
                primaryRole = roles[0]
            }
        }

        // Remove sensitive data
        const { password_hash, ...userData } = user

        return {
            success: true,
            message: "User data fetched successfully",
            data: {
                user: {
                    ...userData,
                    role: primaryRole
                },
                memberships: user.memberships.map((m) => ({
                    id: m.membership_id,
                    tenantId: m.tenant_id,
                    tenantName: m.tenant.name,
                    tenantSubdomain: m.tenant.subdomain,
                    role: m.role,
                    status: m.status,
                    joinedAt: m.joined_at
                }))
            }
        }

    } catch (error: any) {
        console.error("Fetch user error:", error)

        return {
            success: false,
            message: error.message || "Failed to fetch user data",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

// ============================================
// PASSWORD RESET SERVICES - OTP FLOW
// ============================================

/**
 * Forgot Password with OTP Service
 */
export const forgotPasswordOTPService = async (payload: ForgotPasswordPayload) => {
    try {
        const { email } = payload
        const normalizedEmail = email.toLowerCase().trim()

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Generate OTP
        const otp = generateNumericOTP(6)
        const otpExpiry = new Date()
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10) // 10 minutes expiry

        // Save OTP to database
        await prisma.user.update({
            where: { user_id: user.user_id },
            data: {
                reset_otp: otp,
                reset_otp_expires: otpExpiry
            }
        })

        // TODO: Send OTP via email
        // await sendPasswordResetOTP(email, otp)
        console.log(`OTP for ${email}: ${otp}`)

        return {
            success: true,
            message: "OTP sent successfully to your email"
        }

    } catch (error: any) {
        console.error("Forgot password OTP error:", error)
        return {
            success: false,
            message: error.message || "Failed to send OTP",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Verify OTP Service
 */
export const verifyOTPService = async (payload: VerifyOTPPayload) => {
    try {
        const { email, otp } = payload
        const normalizedEmail = email.toLowerCase().trim()

        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Check if OTP exists
        if (!user.reset_otp || !user.reset_otp_expires) {
            return {
                success: false,
                message: "No OTP found. Please request a new one.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Check if OTP is expired
        if (new Date() > user.reset_otp_expires) {
            return {
                success: false,
                message: "OTP has expired. Please request a new one.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Verify OTP
        if (user.reset_otp !== otp) {
            return {
                success: false,
                message: "Invalid OTP",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Generate reset token for password reset
        const resetToken = generateAuthToken(
            { id: user.user_id },
            "15m"
        )

        // Clear OTP after verification
        await prisma.user.update({
            where: { user_id: user.user_id },
            data: {
                reset_otp: null,
                reset_otp_expires: null
            }
        })

        return {
            success: true,
            message: "OTP verified successfully",
            data: {
                reset_token: resetToken
            }
        }

    } catch (error: any) {
        console.error("Verify OTP error:", error)
        return {
            success: false,
            message: error.message || "Failed to verify OTP",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Reset Password with OTP Service
 */
export const resetPasswordWithOTPService = async (payload: ResetPasswordWithOTPPayload) => {
    try {
        const { email, otp, newPassword, confirmPassword } = payload

        // Validate input
        if (!email || !otp || !newPassword) {
            return {
                success: false,
                message: "Email, OTP, and new password are required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (newPassword !== confirmPassword) {
            return {
                success: false,
                message: "Passwords do not match",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (newPassword.length < 8) {
            return {
                success: false,
                message: "Password must be at least 8 characters",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        const normalizedEmail = email.toLowerCase().trim()
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Check OTP
        if (!user.reset_otp || !user.reset_otp_expires) {
            return {
                success: false,
                message: "No OTP found. Please request a new one.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (new Date() > user.reset_otp_expires) {
            return {
                success: false,
                message: "OTP has expired. Please request a new one.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (user.reset_otp !== otp) {
            return {
                success: false,
                message: "Invalid OTP",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Hash new password and update
        const hashedPassword = await hashPassword(newPassword)
        await prisma.user.update({
            where: { user_id: user.user_id },
            data: {
                password_hash: hashedPassword,
                reset_otp: null,
                reset_otp_expires: null
            }
        })

        return {
            success: true,
            message: "Password reset successful. Please login with your new password."
        }

    } catch (error: any) {
        console.error("Reset password error:", error)
        return {
            success: false,
            message: error.message || "Failed to reset password",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

// ============================================
// PASSWORD RESET SERVICES - TOKEN FLOW (LEGACY)
// ============================================

/**
 * Forgot Password with Token Service (Legacy)
 */
export const forgotPasswordService = async (payload: ForgotPasswordPayload) => {
    try {
        const { email } = payload
        console.log("emaildd", email)

        const user = await prisma.user.findUnique({
            where: {
                email: email.toLowerCase().trim()
            }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        const resetToken = jwt.sign(
            { id: user.user_id },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
        )

        const tokenExpiry = new Date()
        tokenExpiry.setHours(tokenExpiry.getHours() + 1)

        // Save token to database
        await prisma.user.update({
            where: { user_id: user.user_id },
            data: {
                reset_token: resetToken,
                reset_token_expires: tokenExpiry
            }
        })

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
        await sendPasswordResetEmail(email, resetLink)

        return {
            success: true,
            message: "Password reset link sent successfully"
        }

    } catch (error: any) {
        console.error("Forgot password error:", error)
        return {
            success: false,
            message: error.message || "Failed to send reset link",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Verify Password Reset with Token Service (Legacy)
 */
export const verifyPasswordResetService = async (payload: VerifyPasswordResetPayload) => {
    try {
        const { token, newPassword, confirmPassword } = payload

        // Validate input
        if (!token || !newPassword) {
            return {
                success: false,
                message: "Token and new password are required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (newPassword !== confirmPassword) {
            return {
                success: false,
                message: "Passwords do not match",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (newPassword.length < 8) {
            return {
                success: false,
                message: "Password must be at least 8 characters",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Verify JWT token
        let decoded
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                return {
                    success: false,
                    message: "Reset link has expired. Please request a new one.",
                    code: httpStatusCode.BAD_REQUEST
                }
            }
            return {
                success: false,
                message: "Invalid reset link. Please request a new one.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Find user by ID from token
        const user = await prisma.user.findUnique({
            where: { user_id: decoded.id }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword)

        // Update user password
        await prisma.user.update({
            where: { user_id: user.user_id },
            data: {
                password_hash: hashedPassword,
                reset_token: null,
                reset_token_expires: null
            }
        })

        return {
            success: true,
            message: "Password reset successful. Please login with your new password."
        }

    } catch (error: any) {
        console.error("Reset password error:", error)
        return {
            success: false,
            message: error.message || "Failed to reset password",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

// ============================================
// USER MANAGEMENT SERVICES
// ============================================

/**
 * Get User Info Service
 */
export const getUserInfoService = async (userId: string) => {
    try {
        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    include: {
                        tenant: true
                    }
                }
            }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        const { password_hash, reset_token, reset_token_expires, reset_otp, reset_otp_expires, ...userData } = user

        return {
            success: true,
            message: "User data fetched successfully",
            data: userData
        }

    } catch (error: any) {
        console.error("Get user info error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch user data",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Update User Service
 */
export const updateAUserService = async (payload: UpdateUserPayload) => {
    try {
        const { userId, body } = payload

        const user = await prisma.user.findUnique({
            where: { user_id: userId }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Prepare update data
        const updateData: any = {}

        if (body.fullName || body.full_name) {
            updateData.full_name = body.fullName || body.full_name
        }

        if (body.phoneNumber || body.phone) {
            updateData.phone = body.phoneNumber || body.phone
        }

        if (body.email) {
            // Check if email already exists for another user
            const existingEmail = await prisma.user.findFirst({
                where: {
                    email: body.email.toLowerCase().trim(),
                    user_id: { not: userId }
                }
            })

            if (existingEmail) {
                return {
                    success: false,
                    message: "Email already exists",
                    code: httpStatusCode.BAD_REQUEST
                }
            }
            updateData.email = body.email.toLowerCase().trim()
        }

        // Update user
        const updatedUser = await prisma.user.update({
            where: { user_id: userId },
            data: updateData
        })

        const { password_hash, reset_token, reset_token_expires, reset_otp, reset_otp_expires, ...userData } = updatedUser

        return {
            success: true,
            message: "User updated successfully",
            data: {
                user: userData
            }
        }

    } catch (error: any) {
        console.error("Update user error:", error)
        return {
            success: false,
            message: error.message || "Failed to update user",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Delete User Service
 */
export const deleteAUserService = async (userId: string) => {
    try {
        const user = await prisma.user.findUnique({
            where: { user_id: userId }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Delete user (cascading will handle related records)
        await prisma.user.delete({
            where: { user_id: userId }
        })

        return {
            success: true,
            message: "User deleted successfully"
        }

    } catch (error: any) {
        console.error("Delete user error:", error)
        return {
            success: false,
            message: error.message || "Failed to delete user",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Update Password Service
 */
export const updateAPasswordService = async (payload: UpdatePasswordPayload) => {
    try {
        const { userId, body } = payload
        const { currentPassword, newPassword, confirmPassword } = body

        // Validate input
        if (!currentPassword || !newPassword) {
            return {
                success: false,
                message: "Current password and new password are required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (newPassword !== confirmPassword) {
            return {
                success: false,
                message: "Passwords do not match",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (newPassword.length < 8) {
            return {
                success: false,
                message: "Password must be at least 8 characters",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        const user = await prisma.user.findUnique({
            where: { user_id: userId }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Verify current password
        const isValidPassword = await comparePassword(currentPassword, user.password_hash)
        if (!isValidPassword) {
            return {
                success: false,
                message: "Current password is incorrect",
                code: httpStatusCode.UNAUTHORIZED
            }
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword)

        // Update password
        await prisma.user.update({
            where: { user_id: userId },
            data: {
                password_hash: hashedPassword
            }
        })

        return {
            success: true,
            message: "Password updated successfully"
        }

    } catch (error: any) {
        console.error("Update password error:", error)
        return {
            success: false,
            message: error.message || "Failed to update password",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

// ============================================
// DASHBOARD SERVICE
// ============================================

/**
 * Get Dashboard Stats Service
 */
// services/admin/tenant/tenant.ts or services/treasurer/dashboard.ts

/**
 * Get Dashboard Stats Service for Treasurer
 */
export const getDashboardStatsService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser

        // Get user with memberships and tenant info
        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    include: {
                        tenant: true,
                        event_members: {
                            include: {
                                event: true,
                                contributions: true
                            }
                        }
                    }
                }
            }
        })

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Get tenant info (assuming treasurer belongs to one tenant)
        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found for this user",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Get all members of this tenant (for dues calculation)
        const tenantMembers = await prisma.membership.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                status: 'active'
            },
            include: {
                user: true,
                event_members: {
                    include: {
                        contributions: true,
                        event: true
                    }
                }
            }
        })

        // Calculate total dues collected (this month)
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        let totalDuesCollected = 0
        let totalDuesCollectedAllTime = 0
        let pendingAmount = 0
        let activeEvents = 0
        let overdueMembers = 0

        // Get all events for this tenant
        const events = await prisma.fundraisingEvent.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                status: 'active'
            },
            include: {
                event_members: {
                    include: {
                        contributions: true,
                        membership: {
                            include: {
                                user: true
                            }
                        }
                    }
                }
            }
        })

        activeEvents = events.length

        // Process each event
        events.forEach(event => {
            const eventMembers = event.event_members || []

            eventMembers.forEach(em => {
                const contributions = em.contributions || []
                
                // Calculate total contributions (all time)
                contributions.forEach(contribution => {
                    const amount = Number(contribution.amount) || 0
                    totalDuesCollectedAllTime += amount

                    // Check if contribution is from this month
                    if (contribution.paid_at) {
                        const paidDate = new Date(contribution.paid_at)
                        if (paidDate >= startOfMonth && paidDate <= endOfMonth) {
                            totalDuesCollected += amount
                        }
                    }
                })

                // Check if member has pending/overdue payments
                const totalPaid = contributions.reduce((sum, c) => sum + Number(c.amount), 0)
                const amountDue = Number(em.amount_due) || 0

                if (totalPaid < amountDue) {
                    pendingAmount += (amountDue - totalPaid)

                    // Check if overdue (past deadline)
                    if (event.deadline && new Date(event.deadline) < now) {
                        overdueMembers++
                    }
                }
            })
        })

        // Get active events count (already calculated above)
        // Get overdue members (already calculated above)

        // Calculate changes (for comparison with previous month)
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

        let lastMonthCollected = 0
        // Get contributions from last month
        const lastMonthContributions = await prisma.contribution.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                paid_at: {
                    gte: startOfLastMonth,
                    lte: endOfLastMonth
                }
            }
        })
        lastMonthCollected = lastMonthContributions.reduce((sum, c) => sum + Number(c.amount), 0)

        // Calculate percentage changes
        const duesCollectedChange = lastMonthCollected > 0 
            ? `${((totalDuesCollected - lastMonthCollected) / lastMonthCollected * 100).toFixed(1)}%`
            : '+0%'

        // Get pending amount from last month
        const lastMonthPending = await prisma.eventMember.count({
            where: {
                event: {
                    tenant_id: tenant.tenant_id
                },
                status: 'pending'
            }
        })

        const pendingAmountChange = lastMonthPending > 0 
            ? `${((pendingAmount - lastMonthPending) / lastMonthPending * 100).toFixed(1)}%`
            : '+0%'

        // Get recent activities
        const recentActivities = await prisma.auditLog.findMany({
            where: {
                tenant_id: tenant.tenant_id
            },
            orderBy: {
                created_at: 'desc'
            },
            take: 5,
            include: {
                user: true
            }
        })

        // Format recent activities
        const formattedActivities = recentActivities.map(log => {
            let type = 'other'
            let description = log.action || 'Activity'
            let amount = undefined
            let status = 'success'

            if (log.action?.toLowerCase().includes('payment') || log.action?.toLowerCase().includes('contribution')) {
                type = 'payment'
                if (log.details && typeof log.details === 'object') {
                    amount = log.details.amount || undefined
                    status = log.details.status || 'success'
                }
            } else if (log.action?.toLowerCase().includes('event')) {
                type = 'event'
            } else if (log.action?.toLowerCase().includes('member')) {
                type = 'member'
            }

            return {
                id: log.log_id,
                type,
                description: log.action || 'Activity',
                amount,
                date: log.created_at,
                status: status as 'success' | 'pending' | 'failed'
            }
        })

        const stats = {
            totalDuesCollected: totalDuesCollected,
            totalDuesCollectedAllTime: totalDuesCollectedAllTime,
            pendingAmount: pendingAmount,
            activeEvents: activeEvents,
            overdueMembers: overdueMembers,
            duesCollectedChange: duesCollectedChange,
            pendingAmountChange: pendingAmountChange,
            activeEventsChange: `+${activeEvents}`,
            overdueMembersChange: overdueMembers > 0 ? `+${overdueMembers}` : '0'
        }

        return {
            success: true,
            message: "Dashboard stats fetched successfully",
            data: {
                tenant: {
                    id: tenant.tenant_id,
                    name: tenant.name,
                    subdomain: tenant.subdomain
                },
                stats: stats,
                recentActivities: formattedActivities
            }
        }

    } catch (error: any) {
        console.error("Dashboard stats error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch dashboard stats",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}