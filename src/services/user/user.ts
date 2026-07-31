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

// types/auth.ts
export interface LoginPayload {
    email: string;
    password: string;
    subdomain?: string; // Optional subdomain for tenant validation
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
interface UpdatePlatformSettingPayload {
    userId: string;
    body: {
        platform_name: string;
        platform_logo?: string;
        default_language: string;
        time_zone: string;
    };
}

// ============================================
// AUTH SERVICES
// ============================================

/**
 * Login Service with Tenant Validation
 */
export const loginService = async (payload: LoginPayload) => {
    try {
        const { email, password, subdomain } = payload; // Add subdomain to payload
        const normalizedEmail = email.toLowerCase().trim();

        // Find user with memberships and tenant details
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            include: {
                memberships: {
                    include: {
                        tenant: true
                    }
                }
            }
        });

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.UNAUTHORIZED
            };
        }

        // Verify password
        const isValidPassword = await comparePassword(password, user.password_hash);
        if (!isValidPassword) {
            return {
                success: false,
                message: "Invalid password",
                code: httpStatusCode.UNAUTHORIZED
            };
        }

        // CRITICAL: Tenant Validation
        // If subdomain is provided, user must belong to that tenant
        if (subdomain) {
            // Check if user has membership in this tenant
            const membership = user.memberships.find(
                m => m.tenant.subdomain === subdomain && m.status === 'active'
            );

            if (!membership) {
                return {
                    success: false,
                    message: `You don't have access to "${subdomain}". Please use your organization's subdomain.`,
                    code: httpStatusCode.FORBIDDEN
                };
            }

            // Super admin can access any tenant, but we still validate membership exists
            // If super admin, allow access regardless of membership
            if (!user.is_super_admin && !membership) {
                return {
                    success: false,
                    message: `Access denied. You are not a member of "${subdomain}".`,
                    code: httpStatusCode.FORBIDDEN
                };
            }
        }

        // Determine role
        let primaryRole = "member";
        let selectedTenant = null;
        let primaryTenantId = null;

        // If subdomain is provided, use that tenant's role
        if (subdomain) {
            const membership = user.memberships.find(
                m => m.tenant.subdomain === subdomain && m.status === 'active'
            );

            if (membership) {
                selectedTenant = membership.tenant;
                primaryTenantId = membership.tenant_id;
                primaryRole = membership.role;
            }
        } else {
            // No subdomain: Super admin OR fallback to first active membership
            if (user.is_super_admin) {
                primaryRole = "admin";
            } else if (user.memberships.length > 0) {
                // Get first active membership
                const activeMembership = user.memberships.find(m => m.status === 'active');
                if (activeMembership) {
                    selectedTenant = activeMembership.tenant;
                    primaryTenantId = activeMembership.tenant_id;
                    primaryRole = activeMembership.role;

                    // Check if user has multiple roles, prioritize treasurer
                    const roles = user.memberships.map((m) => m.role);
                    if (roles.includes("treasurer")) {
                        primaryRole = "treasurer";
                    } else if (roles.includes("admin")) {
                        primaryRole = "admin";
                    } else if (roles.includes("member")) {
                        primaryRole = "member";
                    }
                }
            }
        }

        // Generate token with tenant information
        const token = generateAuthToken({
            id: user.user_id,
            email: user.email,
            role: primaryRole,
            tenant_id: primaryTenantId,
            tenant_subdomain: selectedTenant?.subdomain || null,
            is_super_admin: user.is_super_admin
        });

        // Remove sensitive data
        const { password_hash, ...userData } = user;

        // Prepare response data
        const responseData = {
            user: {
                ...userData,
                role: primaryRole,
                tenant_id: primaryTenantId,
                tenant_subdomain: selectedTenant?.subdomain || null
            },
            role: primaryRole,
            tenants: user.memberships
                .filter(m => m.status === 'active')
                .map(m => ({
                    id: m.tenant_id,
                    name: m.tenant.name,
                    subdomain: m.tenant.subdomain,
                    role: m.role,
                    status: m.tenant.status,
                    logo: m.tenant.logo_url,
                    brand_color: m.tenant.brand_color
                })),
            currentTenant: selectedTenant ? {
                id: selectedTenant.tenant_id,
                name: selectedTenant.name,
                subdomain: selectedTenant.subdomain,
                role: primaryRole
            } : null
        };

        return {
            success: true,
            message: "Login successful",
            data: responseData,
            token
        };

    } catch (error: any) {
        console.error("Login error:", error);
        return {
            success: false,
            message: error.message || "Failed to login",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

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

        // Generate reset token
        const resetToken = jwt.sign(
            { id: user.user_id },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
        )

        const tokenExpiry = new Date()
        tokenExpiry.setHours(tokenExpiry.getHours() + 1)

        // Save token to database using PasswordResetToken model
        await prisma.passwordResetToken.create({
            data: {
                token: resetToken,
                user_id: user.user_id,
                expires_at: tokenExpiry,
                // otp: optional, if you're using OTP as well
                // used: false // This is the default value
            }
        })

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
        // await sendPasswordResetEmail(email, resetLink)

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

        // First, find the password reset token in the database
        const resetToken = await prisma.passwordResetToken.findFirst({
            where: {
                token: token,
                expires_at: {
                    gt: new Date() // Only valid if not expired
                }
            },
            include: {
                user: true
            }
        })

        if (!resetToken) {
            // Check if token exists but is expired
            const expiredToken = await prisma.passwordResetToken.findFirst({
                where: {
                    token: token,
                    expires_at: {
                        lte: new Date()
                    }
                }
            })

            if (expiredToken) {
                // Delete expired token
                await prisma.passwordResetToken.delete({
                    where: { id: expiredToken.id }
                })
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

        const user = resetToken.user

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword)

        // Update user password in a transaction
        await prisma.$transaction([
            // Update user password
            prisma.user.update({
                where: { user_id: user.user_id },
                data: {
                    password_hash: hashedPassword
                }
            }),
            // Delete the used reset token
            prisma.passwordResetToken.delete({
                where: { id: resetToken.id }
            })
        ])

        // Optional: Delete all other reset tokens for this user (for security)
        await prisma.passwordResetToken.deleteMany({
            where: {
                user_id: user.user_id,
                NOT: {
                    id: resetToken.id
                }
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
                if (log.details && typeof log.details === "object" && !Array.isArray(log.details)) {
                    const details = log.details as {
                        amount?: number;
                        status?: string;
                    };

                    amount = details.amount;
                    status = details.status || "success";
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


export const getPlatformSettingService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser;

        console.log("userId", userId);

        const settings = await prisma.platformSetting.findFirst({
            where: {
                user_id: userId,
            },
        });

        if (!settings) {
            return {
                success: false,
                message: "Platform settings data is not available",
                code: httpStatusCode.NOT_FOUND,
            };
        }

        return {
            success: true,
            message: "Platform settings fetched successfully",
            data: settings,
        };
    } catch (error: any) {
        console.error("Get platform settings error:", error);

        return {
            success: false,
            message: error.message || "Failed to fetch platform settings",
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
        };
    }
};


export const updatePlatformSettingService = async (
    payload: UpdatePlatformSettingPayload
) => {
    try {
        const { userId, body } = payload;

        const {
            platform_name,
            platform_logo,
            default_language,
            time_zone,
        } = body;

        if (!platform_name?.trim()) {
            return {
                success: false,
                message: "Platform name is required",
                code: httpStatusCode.BAD_REQUEST,
            };
        }

        let settings = await prisma.platformSetting.findFirst({
            where: {
                user_id: userId,
            },
        });

        if (!settings) {
            settings = await prisma.platformSetting.create({
                data: {
                    user_id: userId,
                    platform_name: platform_name.trim(),
                    platform_logo: platform_logo || null,
                    default_language,
                    time_zone,
                },
            });
        } else {
            settings = await prisma.platformSetting.update({
                where: {
                    id: settings.id,
                },
                data: {
                    platform_name: platform_name.trim(),
                    platform_logo: platform_logo || null,
                    default_language,
                    time_zone,
                },
            });
        }

        return {
            success: true,
            message: "Platform settings updated successfully",
            data: settings,
        };
    } catch (error: any) {
        console.error("Update platform settings error:", error);

        return {
            success: false,
            message: error.message || "Failed to update platform settings",
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
        };
    }
};

export const getTenantDomainDataService = async (subdomain: string) => {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: {
                subdomain: subdomain.toLowerCase(),
            },
            include: {
                memberships: {
                    where: {
                        role: "treasurer",
                    },
                    select: {
                        user_id: true,
                    },
                    take: 1,
                },
            },
        });

        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: 404,
            };
        }

        const userId = tenant.memberships[0]?.user_id;

        let settings = null;

        if (userId) {
            settings = await prisma.platformSetting.findFirst({
                where: {
                    user_id: userId,
                },
            });
        }

        return {
            success: true,
            data: {
                tenant,
                settings,
            },
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message,
            code: 500,
        };
    }
};