// services/admin/tenant/tenant.ts
import { Request } from "express"
import prisma from "../../../lib/prisma"
import { httpStatusCode } from "../../../lib/constant"
import { hashPassword, generateNumericOTP } from "../../../utils/auth-utils"
import { CreateTenantPayload, UpdateTenantPayload, TenantQueryParams } from "../../../types/admin"
import { sendTenantInviteEmail } from "../../../utils/mails/email-service"

// ============================================
// TENANT SERVICES
// ============================================

/**
 * Get all tenants with pagination and filters
 */
export const getAllTenantsService = async (req: Request) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = 'all',
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query as TenantQueryParams

        const skip = (Number(page) - 1) * Number(limit)
        const take = Number(limit)

        let where: any = {}

        if (status !== 'all') {
            where.status = status
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { subdomain: { contains: search, mode: 'insensitive' } },
                {
                    memberships: {
                        some: {
                            user: {
                                email: { contains: search, mode: 'insensitive' }
                            }
                        }
                    }
                }
            ]
        }

        const total = await prisma.tenant.count({ where })

        const tenants = await prisma.tenant.findMany({
            where,
            skip,
            take,
            orderBy: {
                [sortBy]: sortOrder
            },
            include: {
                memberships: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                email: true,
                                full_name: true
                            }
                        }
                    },
                    where: {
                        role: 'treasurer'
                    },
                    take: 1
                },
                contributions: {
                    select: {
                        amount: true
                    }
                },
                _count: {
                    select: {
                        memberships: true,
                        contributions: true,
                        payouts: true
                    }
                }
            }
        })

        const formattedTenants = tenants.map(tenant => {
            const treasurer = tenant.memberships[0]?.user
            const totalFunds = tenant.contributions?.reduce((sum: number, c: any) => sum + Number(c.amount), 0) || 0

            return {
                id: tenant.tenant_id,
                name: tenant.name,
                subdomain: tenant.subdomain,
                status: tenant.status,
                createdDate: tenant.created_at,
                treasurer: treasurer?.full_name || 'Not Assigned',
                treasurerEmail: treasurer?.email || 'Not Assigned',
                bankAccount: tenant.bank_account_ref || 'Not Set',
                members: tenant._count?.memberships || 0,
                totalFunds: totalFunds
            }
        })

        return {
            success: true,
            message: "Tenants fetched successfully",
            data: formattedTenants,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        }

    } catch (error: any) {
        console.error("Get all tenants error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch tenants",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Get tenant by ID
 */
export const getTenantByIdService = async (id: string) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { tenant_id: id },
            include: {
                memberships: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                email: true,
                                full_name: true,
                                phone: true
                            }
                        }
                    }
                },
                fundraising_events: {
                    include: {
                        event_members: {
                            include: {
                                membership: {
                                    include: {
                                        user: {
                                            select: {
                                                full_name: true,
                                                email: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                contributions: {
                    include: {
                        event_member: {
                            include: {
                                membership: {
                                    include: {
                                        user: {
                                            select: {
                                                full_name: true,
                                                email: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                payouts: {
                    include: {
                        beneficiary: true,
                        membership: {
                            include: {
                                user: {
                                    select: {
                                        full_name: true,
                                        email: true
                                    }
                                }
                            }
                        }
                    }
                },
                notifications: true,
                audit_logs: {
                    orderBy: {
                        created_at: 'desc'
                    },
                    take: 10
                }
            }
        })

        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        const totalFunds = tenant.contributions.reduce((sum, c) => sum + Number(c.amount), 0)

        const formattedTenant = {
            ...tenant,
            totalFunds,
            memberCount: tenant.memberships.length,
            eventCount: tenant.fundraising_events.length,
            contributionCount: tenant.contributions.length,
            payoutCount: tenant.payouts.length
        }

        return {
            success: true,
            message: "Tenant fetched successfully",
            data: formattedTenant
        }

    } catch (error: any) {
        console.error("Get tenant by id error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch tenant",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Create new tenant
 */
export const createTenantService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser
        const {
            name,
            subdomain,
            treasurerEmail,
            bankAccount
        }: CreateTenantPayload = req.body

        // Get inviter info for email
        const inviter = await prisma.user.findUnique({
            where: { user_id: userId },
            select: { full_name: true, email: true }
        })

        if (!name || !subdomain || !treasurerEmail) {
            return {
                success: false,
                message: "Name, subdomain, and treasurer email are required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        const existingTenant = await prisma.tenant.findUnique({
            where: { subdomain: subdomain.toLowerCase() }
        })

        if (existingTenant) {
            return {
                success: false,
                message: "Subdomain already taken. Please choose another.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        let treasurerUser = await prisma.user.findUnique({
            where: { email: treasurerEmail }
        })

        let tempPassword = ''

        const result = await prisma.$transaction(async (prisma) => {
            const tenant = await prisma.tenant.create({
                data: {
                    name,
                    subdomain: subdomain.toLowerCase(),
                    bank_account_ref: bankAccount,
                    status: 'pending',
                    created_at: new Date()
                }
            })

            if (!treasurerUser) {
                // tempPassword = generateNumericOTP(8)
                tempPassword= treasurerEmail
                const hashedPassword = await hashPassword(tempPassword)

                treasurerUser = await prisma.user.create({
                    data: {
                        email: treasurerEmail,
                        full_name: 'Treasurer',
                        password_hash: hashedPassword,
                        created_at: new Date()
                    }
                })
            }

            await prisma.membership.create({
                data: {
                    tenant_id: tenant.tenant_id,
                    user_id: treasurerUser.user_id,
                    role: 'treasurer',
                    status: 'active',
                    joined_at: new Date()
                }
            })

            if (userId) {
                await prisma.auditLog.create({
                    data: {
                        tenant_id: tenant.tenant_id,
                        user_id: userId,
                        action: 'TENANT_CREATED',
                        entity_type: 'tenant',
                        entity_id: tenant.tenant_id,
                        details: {
                            name,
                            subdomain,
                            treasurerEmail
                        },
                        created_at: new Date()
                    }
                })
            }

            return tenant
        })

        // Send invitation email to treasurer (after transaction)
        try {
            const emailResult = await sendTenantInviteEmail({
                to: treasurerEmail,
                tenantName: name,
                tenantSubdomain: subdomain.toLowerCase(),
                // tempPassword: tempPassword || 'Please check with your administrator', // If user already existed
                tempPassword: treasurerEmail,
                invitedBy: inviter?.full_name || 'Admin',
                role: 'Treasurer'
            })

            if (emailResult.success) {
                console.log(`✅ Invitation email sent to ${treasurerEmail}`)
            } else {
                console.error(`❌ Failed to send email to ${treasurerEmail}:`, emailResult.error)
                // Don't fail the tenant creation if email fails
            }
        } catch (emailError) {
            console.error('Email sending error:', emailError)
            // Don't fail the tenant creation if email fails
        }

        return {
            success: true,
            message: "Tenant created successfully. Invitation email sent to treasurer.",
            data: {
                ...result,
                emailSent: true
            }
        }

    } catch (error: any) {
        console.error("Create tenant error:", error)
        return {
            success: false,
            message: error.message || "Failed to create tenant",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Update tenant
 */
export const updateTenantService = async (payload: { id: string; userId: string; body: any }) => {
    try {
        const { id, userId, body } = payload
        const { name, subdomain, treasurerEmail, status } = body

        const existingTenant = await prisma.tenant.findUnique({
            where: { tenant_id: id },
            include: {
                memberships: {
                    where: {
                        role: 'treasurer'
                    },
                    include: {
                        user: true
                    }
                }
            }
        })

        if (!existingTenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        if (subdomain && subdomain !== existingTenant.subdomain) {
            const subdomainExists = await prisma.tenant.findFirst({
                where: {
                    subdomain: subdomain.toLowerCase(),
                    tenant_id: { not: id }
                }
            })

            if (subdomainExists) {
                return {
                    success: false,
                    message: "Subdomain already taken. Please choose another.",
                    code: httpStatusCode.BAD_REQUEST
                }
            }
        }

        const updateData: any = {}
        if (name) updateData.name = name
        if (subdomain) updateData.subdomain = subdomain.toLowerCase()
        if (status) updateData.status = status

        let tenant = existingTenant
        if (Object.keys(updateData).length > 0) {
            tenant = await prisma.tenant.update({
                where: { tenant_id: id },
                data: updateData
            })
        }

        if (treasurerEmail) {
            const currentTreasurer = existingTenant.memberships[0]

            if (currentTreasurer?.user?.email !== treasurerEmail) {
                let newTreasurer = await prisma.user.findUnique({
                    where: { email: treasurerEmail }
                })

                if (!newTreasurer) {
                    const tempPassword = generateNumericOTP(8)
                    const hashedPassword = await hashPassword(tempPassword)

                    newTreasurer = await prisma.user.create({
                        data: {
                            email: treasurerEmail,
                            full_name: 'Treasurer',
                            password_hash: hashedPassword,
                            created_at: new Date()
                        }
                    })

                    console.log(`Temporary password for ${treasurerEmail}: ${tempPassword}`)
                }

                if (currentTreasurer) {
                    await prisma.membership.update({
                        where: { membership_id: currentTreasurer.membership_id },
                        data: {
                            user_id: newTreasurer.user_id,
                            status: 'active'
                        }
                    })
                } else {
                    await prisma.membership.create({
                        data: {
                            tenant_id: id,
                            user_id: newTreasurer.user_id,
                            role: 'treasurer',
                            status: 'active',
                            joined_at: new Date()
                        }
                    })
                }
            }
        }

        if (userId) {
            await prisma.auditLog.create({
                data: {
                    tenant_id: id,
                    user_id: userId,
                    action: 'TENANT_UPDATED',
                    entity_type: 'tenant',
                    entity_id: id,
                    details: {
                        name,
                        subdomain,
                        status,
                        treasurerEmail
                    },
                    created_at: new Date()
                }
            })
        }

        const updatedTenant = await prisma.tenant.findUnique({
            where: { tenant_id: id },
            include: {
                memberships: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                email: true,
                                full_name: true
                            }
                        }
                    }
                }
            }
        })

        return {
            success: true,
            message: "Tenant updated successfully",
            data: updatedTenant || tenant
        }

    } catch (error: any) {
        console.error("Update tenant error:", error)

        if (error.code === 'P2025') {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        if (error.code === 'P2002') {
            return {
                success: false,
                message: "Subdomain already exists. Please choose another.",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        return {
            success: false,
            message: error.message || "Failed to update tenant",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Update tenant status
 */
export const updateTenantStatusService = async (payload: { id: string; userId: string; status: string }) => {
    try {
        const { id, userId, status } = payload

        if (!['active', 'pending', 'suspended', 'inactive'].includes(status)) {
            return {
                success: false,
                message: "Invalid status value. Allowed: active, pending, suspended, inactive",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        const existingTenant = await prisma.tenant.findUnique({
            where: { tenant_id: id }
        })

        if (!existingTenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        const tenant = await prisma.tenant.update({
            where: { tenant_id: id },
            data: { status }
        })

        if (userId) {
            await prisma.auditLog.create({
                data: {
                    tenant_id: id,
                    user_id: userId,
                    action: 'TENANT_STATUS_UPDATED',
                    entity_type: 'tenant',
                    entity_id: id,
                    details: {
                        oldStatus: existingTenant.status,
                        newStatus: status
                    },
                    created_at: new Date()
                }
            })
        }

        return {
            success: true,
            message: `Tenant status updated from "${existingTenant.status}" to "${status}"`,
            data: tenant
        }

    } catch (error: any) {
        console.error("Update tenant status error:", error)
        return {
            success: false,
            message: error.message || "Failed to update tenant status",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Delete tenant (force delete - removes all related data using cascade)
 */
export const deleteTenantService = async (payload: { id: string; userId: string }) => {
    try {
        const { id, userId } = payload

        const tenant = await prisma.tenant.findUnique({
            where: { tenant_id: id },
            select: {
                tenant_id: true,
                name: true,
                subdomain: true,
                status: true
            }
        })

        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        if (userId) {
            await prisma.auditLog.create({
                data: {
                    tenant_id: id,
                    user_id: userId,
                    action: 'TENANT_DELETED',
                    entity_type: 'tenant',
                    entity_id: id,
                    details: {
                        name: tenant.name,
                        subdomain: tenant.subdomain,
                        status: tenant.status,
                        deletedAt: new Date().toISOString()
                    },
                    created_at: new Date()
                }
            })
        }

        await prisma.tenant.delete({
            where: { tenant_id: id }
        })

        return {
            success: true,
            message: `Tenant "${tenant.name}" deleted successfully along with all associated data`,
            data: {
                id: tenant.tenant_id,
                name: tenant.name,
                subdomain: tenant.subdomain
            }
        }

    } catch (error: any) {
        console.error("Delete tenant error:", error)

        if (error.code === 'P2025') {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        if (error.code === 'P2003') {
            return {
                success: false,
                message: "Cannot delete tenant due to foreign key constraints",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        return {
            success: false,
            message: error.message || "Failed to delete tenant",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Get tenant statistics
 */
export const getTenantStatsService = async (id: string) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { tenant_id: id }
        })

        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        const memberCount = await prisma.membership.count({
            where: { tenant_id: id }
        })

        const contributionStats = await prisma.contribution.aggregate({
            where: { tenant_id: id },
            _sum: { amount: true },
            _count: { contribution_id: true }
        })

        const payoutStats = await prisma.payout.aggregate({
            where: { tenant_id: id },
            _sum: { amount: true },
            _count: { payout_id: true }
        })

        const eventStats = await prisma.fundraisingEvent.aggregate({
            where: { tenant_id: id },
            _count: { event_id: true }
        })

        const totalContributions = Number(contributionStats._sum.amount) || 0
        const totalPayouts = Number(payoutStats._sum.amount) || 0

        const stats = {
            tenantName: tenant.name,
            memberCount,
            totalContributions,
            totalPayouts,
            contributionCount: contributionStats._count.contribution_id || 0,
            payoutCount: payoutStats._count.payout_id || 0,
            eventCount: eventStats._count.event_id || 0,
            balance: totalContributions - totalPayouts
        }

        return {
            success: true,
            message: "Tenant statistics fetched successfully",
            data: stats
        }

    } catch (error: any) {
        console.error("Get tenant stats error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch tenant statistics",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Check subdomain availability
 */
export const checkSubdomainAvailabilityService = async (payload: { subdomain: string; excludeId?: string }) => {
    try {
        const { subdomain, excludeId } = payload

        if (!subdomain) {
            return {
                success: false,
                message: "Subdomain parameter is required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        const where: any = {
            subdomain: subdomain.toLowerCase()
        }

        if (excludeId) {
            where.tenant_id = { not: excludeId }
        }

        const existing = await prisma.tenant.findFirst({ where })

        return {
            success: true,
            data: {
                available: !existing,
                subdomain: subdomain.toLowerCase()
            }
        }

    } catch (error: any) {
        console.error("Check subdomain error:", error)
        return {
            success: false,
            message: error.message || "Failed to check subdomain availability",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Get Dashboard Stats Service
 */
export const getDashboardStatsService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser

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

        const totalTenants = await prisma.tenant.count()

        const totalEvents = user.memberships.reduce((acc, membership) => {
            return acc + membership.event_members.length
        }, 0)

        const totalContributions = user.memberships.reduce((acc, membership) => {
            return acc + membership.event_members.reduce((sum, em) => {
                return sum + em.contributions.reduce((s, c) => s + Number(c.amount), 0)
            }, 0)
        }, 0)

        const pendingPayments = user.memberships.reduce((acc, membership) => {
            return acc + membership.event_members.filter(em => em.status === 'pending').length
        }, 0)

        const stats = {
            totalTenants,
            userTenants: user.memberships.length,
            totalEvents,
            totalContributions,
            pendingPayments,
            memberships: user.memberships.map(m => ({
                tenantId: m.tenant_id,
                tenantName: m.tenant.name,
                role: m.role,
                joinedAt: m.joined_at
            }))
        }

        return {
            success: true,
            message: "Dashboard stats fetched successfully",
            data: stats
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