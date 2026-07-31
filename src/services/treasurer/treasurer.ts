// services/user/user.ts
import { Request } from "express"
import bcrypt from "bcryptjs"
import jwt, { JwtPayload } from 'jsonwebtoken'
import { customAlphabet } from "nanoid"
import prisma from "../../lib/prisma"
import { httpStatusCode } from "../../lib/constant"
import { hashPassword, generateNumericOTP } from "../../utils/auth-utils"
import { sendMemberInviteEmail } from "../../utils/mails/email-service"

interface AddMemberPayload {
    name: string
    email: string
    phone?: string
    status?: string
}

interface UpdateMemberPayload {
    name?: string
    email?: string
    phone?: string
    status?: string
}



// ============================================
// INTERFACES
// ============================================

export interface ServiceResponse {
    success: boolean;
    message: string;
    code?: number;
    data?: any;
}

interface RecentActivity {
    id: string;
    type: string;
    description: string;
    amount?: number | string;
    date: Date;
    status: "success" | "pending" | "failed";
    user: string;
    details: any;
}

interface ContributionResponse {
    id: string;
    eventName: string;
    amount: number;
    date: string;
    paymentMethod: string;
    status: string;
    transactionId?: string | null;
    description?: string;
}

interface EventResponse {
    id: string;
    name: string;
    amount: number;
    deadline: string;
    description?: string;
    status: 'active' | 'upcoming' | 'ended';
    raisedAmount?: number;
    targetAmount?: number;
    participantCount?: number;
}

interface PendingPaymentResponse {
    id: string;
    memberName: string;
    memberEmail: string;
    amount: number;
    paymentMethod: string;
    referenceNumber: string;
    proofUrl: string;
    proofFileName: string;
    submittedAt: string;
    status: 'pending' | 'approved' | 'rejected';
    eventTitle?: string;
}


/**
 * Get all members for a tenant (all statuses)
 */
export const getMembersService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser

        // Get user with tenant info
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

        // Get tenant (assuming treasurer belongs to one tenant)
        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Get ALL members of this tenant (excluding treasurers) - no status filter
        const members = await prisma.membership.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                role: {
                    not: 'treasurer'
                }
                // ✅ REMOVED status filter to get all statuses
            },
            include: {
                user: {
                    select: {
                        user_id: true,
                        email: true,
                        full_name: true,
                        phone: true,
                        created_at: true
                    }
                },
                event_members: {
                    include: {
                        contributions: true,
                        event: true
                    }
                }
            },
            orderBy: {
                joined_at: 'desc'
            }
        })

        // Format member data
        const formattedMembers = members.map(m => {
            // Calculate outstanding dues
            let outstandingDues = 0
            let totalPaid = 0

            m.event_members.forEach(em => {
                const amountDue = Number(em.amount_due) || 0
                const paid = em.contributions.reduce((sum, c) => sum + Number(c.amount), 0)
                totalPaid += paid
                if (paid < amountDue) {
                    outstandingDues += (amountDue - paid)
                }
            })

            return {
                id: m.membership_id,
                userId: m.user.user_id,
                name: m.user.full_name || 'Unknown',
                email: m.user.email,
                phone: m.user.phone || '',
                joinDate: m.joined_at,
                status: m.status, // ✅ Includes all statuses: 'active', 'inactive', 'pending', etc.
                outstandingDues: outstandingDues,
                totalPaid: totalPaid,
                role: m.role
            }
        })

        // Add summary stats
        const summary = {
            total: formattedMembers.length,
            active: formattedMembers.filter(m => m.status === 'active').length,
            inactive: formattedMembers.filter(m => m.status === 'inactive').length,
            pending: formattedMembers.filter(m => m.status === 'pending').length,
            suspended: formattedMembers.filter(m => m.status === 'suspended').length
        }

        return {
            success: true,
            message: "Members fetched successfully",
            data: formattedMembers,
            summary: summary
        }

    } catch (error: any) {
        console.error("Get members error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch members",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Add a new member to the tenant
 */
export const addMemberService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser
        const { name, email, phone, status = 'active' }: AddMemberPayload = req.body

        // Validate input
        if (!name || !email) {
            return {
                success: false,
                message: "Name and email are required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Get user with tenant info
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

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        let tempPassword = ''
        let isNewUser = false

        // Check if user already exists
        let newUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() }
        })

        // Create user if doesn't exist
        if (!newUser) {
            tempPassword = generateNumericOTP(8)
            const hashedPassword = await hashPassword(tempPassword)

            newUser = await prisma.user.create({
                data: {
                    email: email.toLowerCase().trim(),
                    full_name: name,
                    phone: phone || null,
                    password_hash: hashedPassword,
                    created_at: new Date()
                }
            })
            isNewUser = true
            console.log(`Temporary password for ${email}: ${tempPassword}`)
        }

        // Check if user already has membership in this tenant
        const existingMembership = await prisma.membership.findFirst({
            where: {
                tenant_id: tenant.tenant_id,
                user_id: newUser.user_id
            }
        })

        if (existingMembership) {
            return {
                success: false,
                message: "User already has membership in this tenant",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Create membership
        const newMembership = await prisma.membership.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: newUser.user_id,
                role: 'member',
                status: status,
                joined_at: new Date()
            },
            include: {
                user: {
                    select: {
                        user_id: true,
                        email: true,
                        full_name: true,
                        phone: true,
                        created_at: true
                    }
                }
            }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'MEMBER_ADDED',
                entity_type: 'membership',
                entity_id: newMembership.membership_id,
                details: {
                    name: newUser.full_name,
                    email: newUser.email,
                    phone: newUser.phone,
                    status: status
                },
                created_at: new Date()
            }
        })

        // ✅ Send invitation email to member (if new user)
        if (isNewUser) {
            try {
                const emailResult = await sendMemberInviteEmail({
                    to: email,
                    memberName: name,
                    tenantName: tenant.name,
                    tenantSubdomain: tenant.subdomain,
                    tempPassword: tempPassword,
                    invitedBy: user.full_name || 'Admin',
                    role: 'Member'
                })

                if (emailResult.success) {
                    console.log(`✅ Member invitation email sent to ${email}`)
                } else {
                    console.error(`❌ Failed to send email to ${email}:`, emailResult.error)
                }
            } catch (emailError) {
                console.error('Email sending error:', emailError)
            }
        } else {
            // User already existed - send notification email
            try {
                // Send a notification that they've been added to a new tenant
                const notificationSubject = `You've been added to ${tenant.name}`
                const notificationHtml = `
                    <h2>You've been added to ${tenant.name}</h2>
                    <p>Hello ${newUser.full_name},</p>
                    <p>You have been added as a member of <strong>${tenant.name}</strong>.</p>
                    <p>You can now access this tenant using your existing account.</p>
                    <p>Login here: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login</p>
                `

                // You can use a separate email function here
                console.log(`Notification sent to existing user: ${email}`)
            } catch (emailError) {
                console.error('Notification email error:', emailError)
            }
        }

        return {
            success: true,
            message: isNewUser ? "Member added successfully. Invitation email sent." : "Member added successfully.",
            data: {
                id: newMembership.membership_id,
                userId: newUser.user_id,
                name: newUser.full_name,
                email: newUser.email,
                phone: newUser.phone || '',
                joinDate: newMembership.joined_at,
                status: newMembership.status,
                outstandingDues: 0,
                totalPaid: 0,
                emailSent: isNewUser
            }
        }

    } catch (error: any) {
        console.error("Add member error:", error)
        return {
            success: false,
            message: error.message || "Failed to add member",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Update a member
 */
export const updateMemberService = async (req: Request) => {
    try {
        const { id } = req.params
        const userId = (req as any).currentUser
        const { name, email, phone, status }: UpdateMemberPayload = req.body

        // Get user with tenant info
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

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Find the membership
        const existingMembership = await prisma.membership.findFirst({
            where: {
                membership_id: id,
                tenant_id: tenant.tenant_id
            },
            include: {
                user: true
            }
        })

        if (!existingMembership) {
            return {
                success: false,
                message: "Member not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Update user data
        const updateData: any = {}
        if (name) updateData.full_name = name
        if (email) updateData.email = email.toLowerCase().trim()
        if (phone) updateData.phone = phone

        if (Object.keys(updateData).length > 0) {
            await prisma.user.update({
                where: { user_id: existingMembership.user_id },
                data: updateData
            })
        }

        // Update membership status
        if (status) {
            await prisma.membership.update({
                where: { membership_id: id },
                data: { status }
            })
        }

        // Get updated member
        const updatedMember = await prisma.membership.findFirst({
            where: {
                membership_id: id,
                tenant_id: tenant.tenant_id
            },
            include: {
                user: {
                    select: {
                        user_id: true,
                        email: true,
                        full_name: true,
                        phone: true,
                        created_at: true
                    }
                },
                event_members: {
                    include: {
                        contributions: true,
                        event: true
                    }
                }
            }
        })

        // Calculate outstanding dues
        let outstandingDues = 0
        let totalPaid = 0

        updatedMember?.event_members.forEach(em => {
            const amountDue = Number(em.amount_due) || 0
            const paid = em.contributions.reduce((sum, c) => sum + Number(c.amount), 0)
            totalPaid += paid
            if (paid < amountDue) {
                outstandingDues += (amountDue - paid)
            }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'MEMBER_UPDATED',
                entity_type: 'membership',
                entity_id: id,
                details: {
                    name,
                    email,
                    phone,
                    status
                },
                created_at: new Date()
            }
        })

        return {
            success: true,
            message: "Member updated successfully",
            data: {
                id: updatedMember?.membership_id,
                userId: updatedMember?.user.user_id,
                name: updatedMember?.user.full_name,
                email: updatedMember?.user.email,
                phone: updatedMember?.user.phone || '',
                joinDate: updatedMember?.joined_at,
                status: updatedMember?.status,
                outstandingDues: outstandingDues,
                totalPaid: totalPaid
            }
        }

    } catch (error: any) {
        console.error("Update member error:", error)
        return {
            success: false,
            message: error.message || "Failed to update member",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Delete a member (soft delete - deactivate)
 */
export const deleteMemberService = async (req: Request) => {
    try {
        const { id } = req.params
        const userId = (req as any).currentUser

        // Get user with tenant info
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

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Find the membership
        const existingMembership = await prisma.membership.findFirst({
            where: {
                membership_id: id,
                tenant_id: tenant.tenant_id
            },
            include: {
                user: true
            }
        })

        if (!existingMembership) {
            return {
                success: false,
                message: "Member not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Soft delete - deactivate membership
        await prisma.membership.update({
            where: { membership_id: id },
            data: { status: 'inactive' }
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'MEMBER_DELETED',
                entity_type: 'membership',
                entity_id: id,
                details: {
                    name: existingMembership.user.full_name,
                    email: existingMembership.user.email
                },
                created_at: new Date()
            }
        })

        return {
            success: true,
            message: "Member deactivated successfully"
        }

    } catch (error: any) {
        console.error("Delete member error:", error)
        return {
            success: false,
            message: error.message || "Failed to delete member",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Import members from CSV
 */
export const importMembersService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser
        const { members }: { members: Array<{ name: string; email: string; phone?: string }> } = req.body

        if (!members || members.length === 0) {
            return {
                success: false,
                message: "No members to import",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        // Get user with tenant info
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

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        let imported = 0
        let failed = 0
        const errors: string[] = []

        for (const member of members) {
            try {
                // Check if user exists
                let newUser = await prisma.user.findUnique({
                    where: { email: member.email.toLowerCase().trim() }
                })

                if (!newUser) {
                    const tempPassword = generateNumericOTP(8)
                    const hashedPassword = await hashPassword(tempPassword)

                    newUser = await prisma.user.create({
                        data: {
                            email: member.email.toLowerCase().trim(),
                            full_name: member.name,
                            phone: member.phone || null,
                            password_hash: hashedPassword,
                            created_at: new Date()
                        }
                    })
                }

                // Check if already a member
                const existingMembership = await prisma.membership.findFirst({
                    where: {
                        tenant_id: tenant.tenant_id,
                        user_id: newUser.user_id
                    }
                })

                if (existingMembership) {
                    failed++
                    errors.push(`User ${member.email} already exists in this tenant`)
                    continue
                }

                await prisma.membership.create({
                    data: {
                        tenant_id: tenant.tenant_id,
                        user_id: newUser.user_id,
                        role: 'member',
                        status: 'active',
                        joined_at: new Date()
                    }
                })

                imported++
            } catch (error) {
                failed++
                errors.push(`Failed to import ${member.email}: ${error}`)
            }
        }

        return {
            success: true,
            message: `Imported ${imported} members, ${failed} failed`,
            data: {
                imported,
                failed,
                errors
            }
        }

    } catch (error: any) {
        console.error("Import members error:", error)
        return {
            success: false,
            message: error.message || "Failed to import members",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

// ============================================
// DASHBOARD SERVICE
// ============================================

/**
 * Get Dashboard Stats Service with Recent Activities
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

        // Get the first tenant (assuming user belongs to one tenant)
        const membership = user.memberships[0]
        const tenant = membership?.tenant

        // Calculate stats
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

        // ✅ Fetch recent activities (audit logs)
        let recentActivities: RecentActivity[] = [];

        if (tenant) {
            const auditLogs = await prisma.auditLog.findMany({
                where: {
                    tenant_id: tenant.tenant_id
                },
                orderBy: {
                    created_at: 'desc'
                },
                take: 10,
                include: {
                    user: {
                        select: {
                            user_id: true,
                            email: true,
                            full_name: true
                        }
                    }
                }
            })

            // Format recent activities
            recentActivities = auditLogs.map(log => {
                let type = 'other'
                let description = log.action || 'Activity'
                let amount = undefined
                let status = 'success'

                // Determine activity type
                const actionLower = log.action?.toLowerCase() || ''

                if (actionLower.includes('payment') || actionLower.includes('contribution')) {
                    type = 'payment'
                    if (
                        log.details &&
                        typeof log.details === "object" &&
                        !Array.isArray(log.details)
                    ) {
                        const details = log.details as {
                            amount?: number;
                            status?: "success" | "pending" | "failed";
                        };

                        amount = details.amount;
                        status = details.status || "success";
                    }
                } else if (actionLower.includes('event')) {
                    type = 'event'
                } else if (actionLower.includes('member')) {
                    type = 'member'
                } else if (actionLower.includes('payout')) {
                    type = 'payout'
                }

                return {
                    id: log.log_id,
                    type: type,
                    description: log.action || 'Activity',
                    amount: amount,
                    date: log.created_at,
                    status: status as 'success' | 'pending' | 'failed',
                    user: log.user?.full_name || 'Unknown',
                    details: log.details
                }
            })
        }

        const stats = {
            totalTenants: user.memberships.length,
            totalEvents,
            totalContributions,
            pendingPayments,
            memberships: user.memberships.map(m => ({
                tenantId: m.tenant_id,
                tenantName: m.tenant.name,
                role: m.role,
                joinedAt: m.joined_at
            })),
            recentActivities: recentActivities
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



export const getAnalyticsStatService = async (req: Request) => {
    try {
        const { timeRange = 'this-month', metricType = 'all' } = req.query;

        // Calculate date range
        const dateRange = getDateRange(timeRange as string);

        // Get stats
        const [totalRevenue, totalTenants, totalUsers, collectionData, previousCollectionData] = await Promise.all([
            // Total Revenue (approved contributions)
            prisma.contribution.aggregate({
                where: {
                    status: 'approved',
                    paid_at: dateRange
                },
                _sum: {
                    amount: true
                }
            }),
            // Total Tenants (active)
            prisma.tenant.count({
                where: {
                    status: 'active'
                }
            }),
            // Total Users (with active memberships)
            prisma.user.count({
                where: {
                    memberships: {
                        some: {
                            status: 'active'
                        }
                    }
                }
            }),
            // Collection Rate - Current Period
            prisma.contribution.aggregate({
                where: {
                    paid_at: dateRange
                },
                _count: {
                    contribution_id: true
                },
                _sum: {
                    amount: true
                }
            }),
            // Collection Rate - Previous Period (for comparison)
            prisma.contribution.aggregate({
                where: {
                    paid_at: getPreviousDateRange(dateRange)
                },
                _count: {
                    contribution_id: true
                },
                _sum: {
                    amount: true
                }
            })
        ]);

        // Calculate collection rate
        const totalExpected = Number(await getTotalExpectedContributions(dateRange));

        const totalCollected = Number(collectionData._sum.amount ?? 0);

        const collectionRate =
            totalExpected > 0
                ? (totalCollected / totalExpected) * 100
                : 0;

        const previousExpected = Number(
            await getTotalExpectedContributions(getPreviousDateRange(dateRange))
        );

        const previousCollected = Number(previousCollectionData._sum.amount ?? 0);

        const previousCollectionRate =
            previousExpected > 0
                ? (previousCollected / previousExpected) * 100
                : 0;

        // Calculate changes
        const revenueChange = calculatePercentageChange(
            previousCollected,
            totalCollected
        );

        const collectionChange = calculatePercentageChange(
            previousCollectionRate,
            collectionRate
        );

        // Get growth data
        const growthData = await getGrowthData(dateRange);

        // Get top tenants
        const topTenants = await getTopTenants(dateRange);

        // Get user activity
        const userActivity = await getUserActivity(dateRange);

        // Get pending actions
        const pendingActions = await getPendingActions();

        // Get recent registrations
        const recentRegistrations = await prisma.user.findMany({
            where: {
                created_at: dateRange
            },
            take: 5,
            orderBy: {
                created_at: 'desc'
            },
            include: {
                memberships: {
                    include: {
                        tenant: true
                    },
                    where: {
                        status: 'active'
                    }
                }
            }
        });

        return {
            success: true,
            data: {
                stats: {
                    totalRevenue: totalRevenue._sum.amount || 0,
                    totalTenants,
                    totalUsers,
                    collectionRate: Math.round(collectionRate * 10) / 10,
                    revenueChange: Math.round(revenueChange * 10) / 10,
                    tenantsChange: await getTenantsGrowth(),
                    usersChange: await getUsersGrowth(),
                    collectionChange: Math.round(collectionChange * 10) / 10,
                },
                growthData,
                topTenants: topTenants.map(t => ({
                    // tenantId: t.id,
                    name: t.name,
                    revenue: t.totalRevenue,
                    users: t.totalMembers,
                    growth: t.growth
                })),
                userActivity,
                pendingActions,
                recentRegistrations: recentRegistrations.map(u => ({
                    id: u.user_id,
                    name: u.full_name || 'Unknown',
                    email: u.email,
                    tenant: u.memberships[0]?.tenant?.name || 'No Tenant',
                    joinedAt: u.created_at
                }))
            }
        };

    } catch (error: any) {
        console.error('Analytics error:', error);
        return {
            success: false,
            message: error.message || 'Failed to fetch analytics',
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

// Helper Functions

const getDateRange = (timeRange: string) => {
    const now = new Date();
    const start = new Date(now);

    switch (timeRange) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'this-week':
            start.setDate(now.getDate() - 7);
            break;
        case 'this-month':
            start.setMonth(now.getMonth() - 1);
            break;
        case 'last-month':
            start.setMonth(now.getMonth() - 2);
            break;
        case 'this-quarter':
            start.setMonth(now.getMonth() - 3);
            break;
        case 'this-year':
            start.setFullYear(now.getFullYear() - 1);
            break;
        default:
            start.setMonth(now.getMonth() - 1);
    }

    return {
        gte: start,
        lte: now
    };
};

const getPreviousDateRange = (dateRange: { gte: Date; lte: Date }) => {
    const diff = dateRange.lte.getTime() - dateRange.gte.getTime();
    const end = new Date(dateRange.gte.getTime() - 1);
    const start = new Date(dateRange.gte.getTime() - diff - 1);
    return { gte: start, lte: end };
};

const getTotalExpectedContributions = async (dateRange: { gte: Date; lte: Date }) => {
    const result = await prisma.eventMember.aggregate({
        where: {
            event: {
                created_at: dateRange
            }
        },
        _sum: {
            amount_due: true
        }
    });
    return result._sum.amount_due || 0;
};

const calculatePercentageChange = (oldValue: number, newValue: number) => {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
};

const getTenantsGrowth = async () => {
    const currentMonth = new Date();
    currentMonth.setMonth(currentMonth.getMonth() - 1);

    const previousMonth = new Date(currentMonth);
    previousMonth.setMonth(previousMonth.getMonth() - 1);

    const [current, previous] = await Promise.all([
        prisma.tenant.count({
            where: {
                created_at: { gte: currentMonth }
            }
        }),
        prisma.tenant.count({
            where: {
                created_at: { gte: previousMonth, lt: currentMonth }
            }
        })
    ]);

    return calculatePercentageChange(previous, current);
};

const getUsersGrowth = async () => {
    const currentMonth = new Date();
    currentMonth.setMonth(currentMonth.getMonth() - 1);

    const previousMonth = new Date(currentMonth);
    previousMonth.setMonth(previousMonth.getMonth() - 1);

    const [current, previous] = await Promise.all([
        prisma.user.count({
            where: {
                created_at: { gte: currentMonth }
            }
        }),
        prisma.user.count({
            where: {
                created_at: { gte: previousMonth, lt: currentMonth }
            }
        })
    ]);

    return calculatePercentageChange(previous, current);
};

const getGrowthData = async (dateRange: { gte: Date; lte: Date }) => {
    const months = [];
    const start = new Date(dateRange.gte);
    const end = new Date(dateRange.lte);

    while (start <= end) {
        const monthStart = new Date(start);
        monthStart.setDate(1);
        const monthEnd = new Date(start);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        monthEnd.setDate(0);

        const [tenants, users, revenue] = await Promise.all([
            prisma.tenant.count({
                where: {
                    created_at: { lte: monthEnd }
                }
            }),
            prisma.user.count({
                where: {
                    created_at: { lte: monthEnd }
                }
            }),
            prisma.contribution.aggregate({
                where: {
                    status: 'verified',
                    paid_at: {
                        gte: monthStart,
                        lte: monthEnd
                    }
                },
                _sum: {
                    amount: true
                }
            })
        ]);

        months.push({
            month: start.toLocaleString('default', { month: 'short' }),
            tenants,
            users,
            revenue: revenue._sum.amount || 0
        });

        start.setMonth(start.getMonth() + 1);
    }

    return months.slice(-12); // Return last 12 months
};

const getTopTenants = async (dateRange: { gte: Date; lte: Date }) => {
    const tenants = await prisma.tenant.findMany({
        where: {
            status: "active",
        },
        include: {
            memberships: {
                include: {
                    user: {
                        include: {
                            verified_contributions: {
                                where: {
                                    paid_at: dateRange,
                                },
                            },
                        },
                    },
                },
            },
            _count: {
                select: {
                    memberships: true,
                },
            },
        },
    });

    return tenants
        .map((tenant) => {
            const totalRevenue = tenant.memberships.reduce((tenantSum, membership) => {
                return (
                    tenantSum +
                    membership.user.verified_contributions.reduce(
                        (contributionSum, contribution) =>
                            contributionSum + Number(contribution.amount),
                        0
                    )
                );
            }, 0);

            return {
                // id: tenant.id,
                name: tenant.name,
                totalMembers: tenant._count.memberships,
                totalRevenue,
                growth: 0, // Calculate if needed
            };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);
};

const getUserActivity = async (dateRange: { gte: Date; lte: Date }) => {
    // Get user activity from audit logs or other sources
    const [logins, transactions, registrations] = await Promise.all([
        prisma.auditLog.count({
            where: {
                action: 'login',
                created_at: dateRange
            }
        }),
        prisma.contribution.count({
            where: {
                created_at: dateRange
            }
        }),
        prisma.user.count({
            where: {
                created_at: dateRange
            }
        })
    ]);

    // Get previous period for changes
    const prevRange = getPreviousDateRange(dateRange);
    const [prevLogins, prevTransactions, prevRegistrations] = await Promise.all([
        prisma.auditLog.count({
            where: {
                action: 'login',
                created_at: prevRange
            }
        }),
        prisma.contribution.count({
            where: {
                created_at: prevRange
            }
        }),
        prisma.user.count({
            where: {
                created_at: prevRange
            }
        })
    ]);

    return [
        {
            action: 'Logins',
            count: logins,
            change: Math.round(calculatePercentageChange(prevLogins, logins))
        },
        {
            action: 'Transactions',
            count: transactions,
            change: Math.round(calculatePercentageChange(prevTransactions, transactions))
        },
        {
            action: 'New Registrations',
            count: registrations,
            change: Math.round(calculatePercentageChange(prevRegistrations, registrations))
        },
        {
            action: 'Audit Events',
            count: await prisma.auditLog.count({
                where: { created_at: dateRange }
            }),
            change: Math.round(calculatePercentageChange(
                await prisma.auditLog.count({ where: { created_at: prevRange } }),
                await prisma.auditLog.count({ where: { created_at: dateRange } })
            ))
        }
    ];
};

const getPendingActions = async () => {
    const [pendingTenants, pendingContributions, pendingMemberships] = await Promise.all([
        prisma.tenant.count({
            where: { status: 'pending' }
        }),
        prisma.contribution.count({
            where: { status: 'pending' }
        }),
        prisma.membership.count({
            where: { status: 'pending' }
        })
    ]);

    return [
        {
            type: 'Pending Tenants',
            count: pendingTenants,
            description: 'Tenants awaiting approval'
        },
        {
            type: 'Pending Contributions',
            count: pendingContributions,
            description: 'Contributions awaiting verification'
        },
        {
            type: 'Pending Memberships',
            count: pendingMemberships,
            description: 'User memberships awaiting approval'
        }
    ];
};












// ============================================
// PAYMENT VERIFICATION SERVICES
// ============================================

/**
 * Get Pending Payments Service - Treasurer
 * Returns all payments with pending status first, then approved and rejected
 */
export const getAllPaymentsService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;

        // Get user with memberships and tenant
        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    where: {
                        status: 'active'
                    },
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
                code: httpStatusCode.NOT_FOUND
            };
        }

        const membership = user.memberships[0];
        if (!membership) {
            return {
                success: false,
                message: "No active membership found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        const tenant = membership.tenant;
        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Get all contributions with their event members and users
        const contributions = await prisma.contribution.findMany({
            where: {
                tenant_id: tenant.tenant_id
            },
            include: {
                event_member: {
                    include: {
                        membership: {
                            include: {
                                user: true
                            }
                        },
                        event: {
                            select: {
                                purpose: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        // Transform to payment format
        const paymentMethodMap: Record<string, string> = {
            'cashapp': 'Cash App',
            'venmo': 'Venmo',
            'zelle': 'Zelle',
            'stripe': 'Stripe',
            'paypal': 'PayPal',
            'bank_transfer': 'Bank Transfer',
            'cash': 'Cash',
            'card': 'Credit Card',
            'mobile_money': 'Mobile Money',
            'other': 'Other'
        };

        const payments = contributions.map((contribution: any) => {
            const eventMember = contribution.event_member;
            const member = eventMember?.membership?.user;
            const event = eventMember?.event;

            return {
                id: contribution.contribution_id,
                memberName: member?.full_name || 'Unknown Member',
                memberEmail: member?.email || 'No email',
                amount: Number(contribution.amount),
                paymentMethod: paymentMethodMap[contribution.payment_method || ''] || contribution.payment_method || 'N/A',
                referenceNumber: contribution.payment_reference || 'N/A',
                proofUrl: contribution.proof_file || '',
                proofFileName: contribution.proof_file ? contribution.proof_file.split('/').pop() : 'No proof',
                submittedAt: contribution.created_at.toISOString(),
                status: contribution.status, // 'pending' | 'approved' | 'rejected'
                eventTitle: event?.purpose || 'General Contribution'
            };
        });

        // Sort: pending first, then approved, then rejected
        const sortedPayments = payments.sort((a, b) => {
            const statusOrder = { pending: 0, approved: 1, rejected: 2 };
            return (statusOrder[a.status as keyof typeof statusOrder] || 0) -
                (statusOrder[b.status as keyof typeof statusOrder] || 0);
        });

        return {
            success: true,
            message: "Payments fetched successfully",
            data: sortedPayments
        };

    } catch (error: any) {
        console.error("Get all payments error:", error);
        return {
            success: false,
            message: error.message || "Failed to fetch payments",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

// ============================================
// UPDATE PAYMENT STATUS SERVICE
// ============================================

export const updatePaymentStatusService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { paymentId } = req.params;
        const { status, reason } = req.body; // status: 'approved' or 'rejected'

        if (!paymentId) {
            return {
                success: false,
                message: "Payment ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!status || !['approved', 'rejected'].includes(status)) {
            return {
                success: false,
                message: "Valid status is required (approved or rejected)",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (status === 'rejected' && (!reason || reason.trim() === '')) {
            return {
                success: false,
                message: "Rejection reason is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get the contribution
        const contribution = await prisma.contribution.findUnique({
            where: { contribution_id: paymentId },
            include: {
                event_member: {
                    include: {
                        membership: {
                            include: {
                                user: true,
                                tenant: true
                            }
                        },
                        event: true
                    }
                }
            }
        });

        if (!contribution) {
            return {
                success: false,
                message: "Payment not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        if (contribution.status !== 'pending') {
            return {
                success: false,
                message: `Payment is already ${contribution.status}`,
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Update contribution status
        const updateData: any = {
            status: status,
            verified_by: userId
        };

        if (status === 'approved') {
            updateData.paid_at = new Date();
            // Update event member status to paid
            await prisma.eventMember.update({
                where: { event_member_id: contribution.event_member_id },
                data: { status: 'paid' }
            });
        }

        const updatedContribution = await prisma.contribution.update({
            where: { contribution_id: paymentId },
            data: updateData
        });

        // Create notification for the member
        const notificationMessage = status === 'approved'
            ? `Your payment of ${contribution.amount} for ${contribution.event_member.event?.purpose || 'event'} has been approved.`
            : `Your payment of ${contribution.amount} for ${contribution.event_member.event?.purpose || 'event'} was rejected. Reason: ${reason}`;

        await prisma.notification.create({
            data: {
                tenant_id: contribution.event_member.membership.tenant_id,
                user_id: contribution.event_member.membership.user_id,
                type: status === 'approved' ? 'payment_approved' : 'payment_rejected',
                message: notificationMessage,
                sent_at: new Date()
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: contribution.event_member.membership.tenant_id,
                user_id: userId,
                action: `Payment ${status}`,
                entity_type: 'Contribution',
                entity_id: contribution.contribution_id,
                details: {
                    amount: Number(contribution.amount),
                    memberName: contribution.event_member.membership.user?.full_name,
                    eventName: contribution.event_member.event?.purpose,
                    status: status,
                    reason: reason || null
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: `Payment ${status} successfully`,
            data: {
                paymentId: updatedContribution.contribution_id,
                status: updatedContribution.status
            }
        };

    } catch (error: any) {
        console.error("Update payment status error:", error);
        return {
            success: false,
            message: error.message || "Failed to update payment status",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

// ============================================
// PAYOUT SERVICES
// ============================================

/**
 * Get All Payouts Service
 */
export const getPayoutsService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;

        // Get user with memberships and tenant
        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    where: {
                        status: 'active'
                    },
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
                code: httpStatusCode.NOT_FOUND
            };
        }

        const membership = user.memberships[0];
        if (!membership) {
            return {
                success: false,
                message: "No active membership found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        const tenant = membership.tenant;
        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Get all payouts for this tenant
        const payouts = await prisma.payout.findMany({
            where: {
                tenant_id: tenant.tenant_id
            },
            include: {
                beneficiary: {
                    select: {
                        name: true
                    }
                },
                membership: {
                    include: {
                        user: {
                            select: {
                                full_name: true,
                                email: true
                            }
                        }
                    }
                },
                recorder: {
                    select: {
                        full_name: true
                    }
                }
            },
            orderBy: {
                payout_date: 'desc'
            }
        });

        // Transform to response format
        const formattedPayouts = payouts.map((payout: any) => ({
            id: payout.payout_id,
            beneficiaryName: payout.beneficiary?.name || 'Unknown Beneficiary',
            memberName: payout.membership?.user?.full_name || 'Unknown Member',
            memberEmail: payout.membership?.user?.email || '',
            amount: Number(payout.amount),
            date: payout.payout_date || payout.created_at,
            status: payout.status || 'pending',
            notes: payout.notes || '',
            payoutDate: payout.payout_date || payout.created_at,
            recordedBy: payout.recorder?.full_name || 'System',
            createdAt: payout.created_at
        }));

        return {
            success: true,
            message: "Payouts fetched successfully",
            data: formattedPayouts
        };

    } catch (error: any) {
        console.error("Get payouts error:", error);
        return {
            success: false,
            message: error.message || "Failed to fetch payouts",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};


/**
 * Create Payout Service
 */
/**
 * Create Payout Service
 */
export const createPayoutService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { beneficiaryName, memberId, amount, date, notes, beneficiaryId } = req.body;

        // Validate required fields
        if (!beneficiaryName && !beneficiaryId) {
            return {
                success: false,
                message: "Beneficiary name or ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!amount || Number(amount) <= 0) {
            return {
                success: false,
                message: "Valid amount is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!date) {
            return {
                success: false,
                message: "Date is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get user with memberships and tenant
        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    where: {
                        status: 'active'
                    },
                    include: {
                        tenant: true,
                        user: true  // Include user here
                    }
                }
            }
        });

        if (!user) {
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        const membership = user.memberships[0];
        if (!membership) {
            return {
                success: false,
                message: "No active membership found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        const tenant = membership.tenant;
        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Find or create beneficiary
        let beneficiary;

        if (beneficiaryId) {
            beneficiary = await prisma.beneficiary.findFirst({
                where: {
                    beneficiary_id: beneficiaryId,
                    tenant_id: tenant.tenant_id
                }
            });

            if (!beneficiary) {
                return {
                    success: false,
                    message: "Beneficiary not found",
                    code: httpStatusCode.NOT_FOUND
                };
            }
        } else {
            beneficiary = await prisma.beneficiary.create({
                data: {
                    tenant_id: tenant.tenant_id,
                    membership_id: membership.membership_id,
                    name: beneficiaryName,
                    relationship: 'other',
                    contact_info: ''
                }
            });
        }

        // Find member (membership) if memberId provided
        let targetMembership = membership;

        if (memberId) {
            // Validate if memberId is a valid UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const isValidUUID = uuidRegex.test(memberId);

            if (isValidUUID) {
                const foundMembership = await prisma.membership.findFirst({
                    where: {
                        membership_id: memberId,
                        tenant_id: tenant.tenant_id,
                        status: 'active'
                    },
                    include: {
                        tenant: true,
                        user: true
                    }
                });

                if (foundMembership) {
                    targetMembership = foundMembership;
                }
            }
            // If not a valid UUID, treat memberId as a user email or name to search
            else {
                // Try to find user by email
                const foundUser = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: memberId },
                            { full_name: { contains: memberId, mode: 'insensitive' } }
                        ]
                    }
                });

                if (foundUser) {
                    const foundMembership = await prisma.membership.findFirst({
                        where: {
                            tenant_id: tenant.tenant_id,
                            user_id: foundUser.user_id,
                            status: 'active'
                        },
                        include: {
                            tenant: true,
                            user: true
                        }
                    });

                    if (foundMembership) {
                        targetMembership = foundMembership;
                    }
                }
            }
        }

        // Create payout
        const payout = await prisma.payout.create({
            data: {
                tenant_id: tenant.tenant_id,
                beneficiary_id: beneficiary.beneficiary_id,
                membership_id: targetMembership.membership_id,
                amount: Number(amount),
                payout_date: new Date(date),
                status: 'pending',
                notes: notes || '',
                recorded_by: userId
            },
            include: {
                beneficiary: {
                    select: {
                        name: true
                    }
                },
                membership: {
                    include: {
                        user: {
                            select: {
                                full_name: true
                            }
                        }
                    }
                }
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'Payout Created',
                entity_type: 'Payout',
                entity_id: payout.payout_id,
                details: {
                    amount: Number(amount),
                    beneficiaryName: beneficiary.name,
                    memberName: payout.membership?.user?.full_name || 'Unknown'
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Payout created successfully",
            data: {
                id: payout.payout_id,
                beneficiaryName: payout.beneficiary?.name || beneficiaryName,
                memberName: payout.membership?.user?.full_name || 'Unknown',
                amount: Number(payout.amount),
                date: payout.payout_date,
                status: payout.status,
                notes: payout.notes
            }
        };

    } catch (error: any) {
        console.error("Create payout error:", error);
        return {
            success: false,
            message: error.message || "Failed to create payout",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Update Payout Service
 */
export const updatePayoutService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { payoutId } = req.params;
        const { beneficiaryName, amount, date, status, notes } = req.body;

        if (!payoutId) {
            return {
                success: false,
                message: "Payout ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get the payout
        const existingPayout = await prisma.payout.findUnique({
            where: { payout_id: payoutId },
            include: {
                beneficiary: true,
                membership: {
                    include: {
                        user: true
                    }
                }
            }
        });

        if (!existingPayout) {
            return {
                success: false,
                message: "Payout not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Update payout
        const updateData: any = {};

        if (amount) updateData.amount = Number(amount);
        if (date) updateData.payout_date = new Date(date);
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        // Update beneficiary name if provided
        if (beneficiaryName && existingPayout.beneficiary) {
            await prisma.beneficiary.update({
                where: { beneficiary_id: existingPayout.beneficiary_id },
                data: { name: beneficiaryName }
            });
        }

        const updatedPayout = await prisma.payout.update({
            where: { payout_id: payoutId },
            data: updateData,
            include: {
                beneficiary: {
                    select: {
                        name: true
                    }
                },
                membership: {
                    include: {
                        user: {
                            select: {
                                full_name: true
                            }
                        }
                    }
                }
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: existingPayout.tenant_id,
                user_id: userId,
                action: 'Payout Updated',
                entity_type: 'Payout',
                entity_id: payoutId,
                details: {
                    changes: updateData
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Payout updated successfully",
            data: {
                id: updatedPayout.payout_id,
                beneficiaryName: updatedPayout.beneficiary?.name || 'Unknown',
                memberName: updatedPayout.membership?.user?.full_name || 'Unknown',
                amount: Number(updatedPayout.amount),
                date: updatedPayout.payout_date,
                status: updatedPayout.status,
                notes: updatedPayout.notes
            }
        };

    } catch (error: any) {
        console.error("Update payout error:", error);
        return {
            success: false,
            message: error.message || "Failed to update payout",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Delete Payout Service
 */
export const deletePayoutService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { payoutId } = req.params;

        if (!payoutId) {
            return {
                success: false,
                message: "Payout ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get the payout
        const existingPayout = await prisma.payout.findUnique({
            where: { payout_id: payoutId }
        });

        if (!existingPayout) {
            return {
                success: false,
                message: "Payout not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Delete the payout
        await prisma.payout.delete({
            where: { payout_id: payoutId }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: existingPayout.tenant_id,
                user_id: userId,
                action: 'Payout Deleted',
                entity_type: 'Payout',
                entity_id: payoutId,
                details: {
                    amount: Number(existingPayout.amount),
                    payoutDate: existingPayout.payout_date
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Payout deleted successfully",
            data: {
                payoutId: payoutId
            }
        };

    } catch (error: any) {
        console.error("Delete payout error:", error);
        return {
            success: false,
            message: error.message || "Failed to delete payout",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Generate Report Service
 */
export const generateReportService = async (req: Request): Promise<ServiceResponse> => {
    try {

        const userId = (req as any).currentUser;
        const { reportType, startDate, endDate, format } = req.body;
        if (!reportType) {
            return {
                success: false,
                message: "Report type is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!startDate || !endDate) {
            return {
                success: false,
                message: "Start date and end date are required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get user with memberships and tenant
        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    where: {
                        status: 'active'
                    },
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
                code: httpStatusCode.NOT_FOUND
            };
        }

        const membership = user.memberships[0];
        if (!membership) {
            return {
                success: false,
                message: "No active membership found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        const tenant = membership.tenant;
        if (!tenant) {
            return {
                success: false,
                message: "Tenant not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);

        let records: any[] = [];
        let totalAmount = 0;

        switch (reportType) {
            case 'contributions':
                // Get contributions
                const contributions = await prisma.contribution.findMany({
                    where: {
                        tenant_id: tenant.tenant_id,
                        created_at: {
                            gte: start,
                            lte: end
                        }
                    },
                    include: {
                        event_member: {
                            include: {
                                membership: {
                                    include: {
                                        user: true
                                    }
                                },
                                event: true
                            }
                        }
                    },
                    orderBy: {
                        created_at: 'desc'
                    }
                });

                records = contributions.map((c: any) => ({
                    id: c.contribution_id,
                    date: c.created_at.toISOString().split('T')[0],
                    member: c.event_member?.membership?.user?.full_name || 'Unknown',
                    amount: Number(c.amount),
                    type: 'Contribution',
                    status: c.status.charAt(0).toUpperCase() + c.status.slice(1),
                    reference: c.payment_reference || 'N/A',
                    paymentMethod: c.payment_method || 'N/A'
                }));

                totalAmount = contributions.reduce((sum, c) => sum + Number(c.amount), 0);
                break;

            case 'dues':
                // Get dues (event members with pending/paid status)
                // Using event.created_at or event.deadline for date filtering
                const dues = await prisma.eventMember.findMany({
                    where: {
                        membership: {
                            tenant_id: tenant.tenant_id
                        },
                        event: {
                            OR: [
                                { created_at: { gte: start, lte: end } },
                                { deadline: { gte: start, lte: end } }
                            ]
                        }
                    },
                    include: {
                        membership: {
                            include: {
                                user: true
                            }
                        },
                        event: true,
                        contributions: true
                    }
                });

                records = dues.map((d: any) => {
                    const paidAmount = d.contributions.reduce((sum: number, c: any) => sum + Number(c.amount), 0);
                    const dueDate = d.event?.deadline || d.event?.created_at || new Date();

                    return {
                        id: d.event_member_id,
                        date: dueDate.toISOString().split('T')[0],
                        member: d.membership?.user?.full_name || 'Unknown',
                        amount: Number(d.amount_due),
                        type: 'Dues',
                        status: d.status.charAt(0).toUpperCase() + d.status.slice(1),
                        reference: 'N/A',
                        paymentMethod: paidAmount > 0 ? 'Paid' : 'Pending'
                    };
                });

                totalAmount = dues.reduce((sum, d) => sum + Number(d.amount_due), 0);
                break;

            case 'payouts':
                // Get payouts
                const payouts = await prisma.payout.findMany({
                    where: {
                        tenant_id: tenant.tenant_id,
                        payout_date: {
                            gte: start,
                            lte: end
                        }
                    },
                    include: {
                        beneficiary: true,
                        membership: {
                            include: {
                                user: true
                            }
                        }
                    },
                    orderBy: {
                        payout_date: 'desc'
                    }
                });

                records = payouts.map((p: any) => ({
                    id: p.payout_id,
                    date: p.payout_date ? p.payout_date.toISOString().split('T')[0] : 'N/A',
                    member: p.membership?.user?.full_name || 'Unknown',
                    amount: Number(p.amount),
                    type: 'Payout',
                    status: p.status.charAt(0).toUpperCase() + p.status.slice(1),
                    reference: 'N/A',
                    paymentMethod: p.notes || 'N/A'
                }));

                totalAmount = payouts.reduce((sum, p) => sum + Number(p.amount), 0);
                break;

            case 'reconciliation':
                // Get all financial data for reconciliation
                const allContributions = await prisma.contribution.findMany({
                    where: {
                        tenant_id: tenant.tenant_id,
                        created_at: {
                            gte: start,
                            lte: end
                        }
                    },
                    include: {
                        event_member: {
                            include: {
                                membership: {
                                    include: {
                                        user: true
                                    }
                                }
                            }
                        }
                    }
                });

                const allPayouts = await prisma.payout.findMany({
                    where: {
                        tenant_id: tenant.tenant_id,
                        payout_date: {
                            gte: start,
                            lte: end
                        }
                    },
                    include: {
                        membership: {
                            include: {
                                user: true
                            }
                        }
                    }
                });

                const totalContributions = allContributions.reduce((sum, c) => sum + Number(c.amount), 0);
                const totalPayouts = allPayouts.reduce((sum, p) => sum + Number(p.amount), 0);

                // Combine contributions and payouts
                const contributionRecords = allContributions.map((c: any) => ({
                    id: c.contribution_id,
                    date: c.created_at.toISOString().split('T')[0],
                    member: c.event_member?.membership?.user?.full_name || 'Unknown',
                    amount: Number(c.amount),
                    type: 'Contribution',
                    status: 'Completed',
                    reference: c.payment_reference || 'N/A',
                    paymentMethod: c.payment_method || 'N/A'
                }));

                const payoutRecords = allPayouts.map((p: any) => ({
                    id: p.payout_id,
                    date: p.payout_date ? p.payout_date.toISOString().split('T')[0] : 'N/A',
                    member: p.membership?.user?.full_name || 'Unknown',
                    amount: -Number(p.amount), // Negative for payouts
                    type: 'Payout',
                    status: 'Completed',
                    reference: 'N/A',
                    paymentMethod: p.notes || 'N/A'
                }));

                records = [...contributionRecords, ...payoutRecords];
                // Sort by date
                records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                totalAmount = totalContributions - totalPayouts;
                break;

            default:
                return {
                    success: false,
                    message: "Invalid report type",
                    code: httpStatusCode.BAD_REQUEST
                };
        }

        return {
            success: true,
            message: "Report generated successfully",
            data: {
                records,
                totalRecords: records.length,
                totalAmount
            }
        };

    } catch (error: any) {
        console.error("Generate report error:", error);
        return {
            success: false,
            message: error.message || "Failed to generate report",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};


/**
 * Export Report Service
 */
export const exportReportService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { reportType, startDate, endDate, format } = req.body;

        if (!reportType || !startDate || !endDate || !format) {
            return {
                success: false,
                message: "Missing required parameters",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Generate the report data first
        const reportResult = await generateReportService(req);

        if (!reportResult.success || !reportResult.data) {
            return {
                success: false,
                message: reportResult.message || "Failed to generate report data",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        const { records, totalRecords, totalAmount } = reportResult.data;

        // Initialize variables
        let fileData: Buffer = Buffer.from('');
        let contentType: string = 'text/plain';
        let fileName: string = 'report.txt';

        if (format === 'csv') {
            // CSV export
            const headers = ['Date', 'Member', 'Amount', 'Type', 'Status', 'Reference', 'Payment Method'];
            let csvContent = headers.join(',') + '\n';

            records.forEach((row: any) => {
                csvContent += [
                    row.date,
                    `"${row.member}"`,
                    row.amount,
                    row.type,
                    row.status,
                    row.reference || '',
                    row.paymentMethod || ''
                ].join(',') + '\n';
            });

            // Add summary at the end
            csvContent += `\nTotal Records,${totalRecords}`;
            csvContent += `\nTotal Amount,${totalAmount}`;

            fileData = Buffer.from(csvContent, 'utf-8');
            contentType = 'text/csv';
            fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else if (format === 'excel') {
            // Excel export (xlsx format using simple HTML table)
            const headers = ['Date', 'Member', 'Amount', 'Type', 'Status', 'Reference', 'Payment Method'];
            let tableHtml = `<table>`;
            tableHtml += `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

            records.forEach((row: any) => {
                tableHtml += `<tr>${[
                    row.date,
                    row.member,
                    row.amount,
                    row.type,
                    row.status,
                    row.reference || '',
                    row.paymentMethod || ''
                ].map(cell => `<td>${cell}</td>`).join('')}</tr>`;
            });
            tableHtml += `</table>`;

            // Add summary
            tableHtml += `<br><br>`;
            tableHtml += `<table>`;
            tableHtml += `<tr><td><strong>Total Records:</strong></td><td>${totalRecords}</td></tr>`;
            tableHtml += `<tr><td><strong>Total Amount:</strong></td><td>$${totalAmount.toLocaleString()}</td></tr>`;
            tableHtml += `</table>`;

            const htmlContent = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" 
                      xmlns:x="urn:schemas-microsoft-com:office:excel" 
                      xmlns="http://www.w3.org/TR/REC-html40">
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            table { border-collapse: collapse; width: 100%; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            th { background-color: #f2f2f2; font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <h2>${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report</h2>
                        <p><strong>Date Range:</strong> ${startDate} to ${endDate}</p>
                        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                        ${tableHtml}
                    </body>
                </html>
            `;

            fileData = Buffer.from(htmlContent, 'utf-8');
            contentType = 'application/vnd.ms-excel';
            fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}.xls`;
        }

        return {
            success: true,
            message: "Report exported successfully",
            data: {
                fileData,
                contentType,
                fileName
            }
        };

    } catch (error: any) {
        console.error("Export report error:", error);
        return {
            success: false,
            message: error.message || "Failed to export report",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};