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
        let recentActivities = []
        
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
                    if (log.details && typeof log.details === 'object') {
                        amount = log.details.amount || undefined
                        status = log.details.status || 'success'
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