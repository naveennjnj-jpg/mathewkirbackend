// services/treasurer/events.ts
import { Request } from "express"
import prisma from "../../lib/prisma"
import { httpStatusCode } from "../../lib/constant"
import { sendMemberInviteEmail } from "../../utils/mails/email-service"

interface CreateEventPayload {
    title: string
    description?: string
    fixedAmount: number
    deadline: string
    beneficiaryName?: string
    beneficiaryRelationship?: string
    members: string[] // Array of membership IDs
}

interface UpdateEventPayload {
    title?: string
    description?: string
    fixedAmount?: number
    deadline?: string
    status?: string
    beneficiaryName?: string
    beneficiaryRelationship?: string
}


// services/treasurer/events.ts

export const createEventService = async (req: Request) => {
    try {
        console.log('========================================')
        console.log('🚀 STARTING EVENT CREATION PROCESS')
        console.log('========================================')
        
        const userId = (req as any).currentUser
        console.log('👤 Current User ID:', userId)

        console.log('📥 Request Body:', req.body)
        console.log('📥 Uploaded File:', req.file)

        let { 
            title,
            description,
            fixedAmount,
            deadline,
            beneficiaryName,
            beneficiaryRelationship,
            members
        } = req.body

        console.log('📋 Parsing Request Data:')
        console.log('  - Title:', title)
        console.log('  - Description:', description)
        console.log('  - Fixed Amount:', fixedAmount)
        console.log('  - Deadline:', deadline)
        console.log('  - Beneficiary Name:', beneficiaryName)
        console.log('  - Beneficiary Relationship:', beneficiaryRelationship)
        console.log('  - Members (raw):', members)

        // Handle FormData values
        if (typeof fixedAmount === 'string') {
            fixedAmount = parseFloat(fixedAmount)
            console.log('💰 Fixed Amount (parsed):', fixedAmount)
        }

        // Parse members if it's a string
        if (typeof members === 'string') {
            console.log('📦 Members is string, parsing...')
            try {
                members = JSON.parse(members)
                console.log('✅ Members parsed successfully:', members)
            } catch (e) {
                console.log('⚠️ Failed to parse members, converting to array')
                if (members) {
                    members = [members]
                } else {
                    members = []
                }
            }
        }

        if (!Array.isArray(members)) {
            console.log('⚠️ Members is not an array, converting...')
            members = []
        }

        console.log('✅ Final Members Array:', members)
        console.log('📊 Member Count:', members.length)

        // Validation
        console.log('🔍 Validating input...')
        
        if (!title || title.trim() === '') {
            console.log('❌ Validation failed: Title is required')
            return {
                success: false,
                message: "Title is required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (!fixedAmount || fixedAmount <= 0) {
            console.log('❌ Validation failed: Valid fixed amount is required')
            return {
                success: false,
                message: "Valid fixed amount is required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (!deadline) {
            console.log('❌ Validation failed: Deadline is required')
            return {
                success: false,
                message: "Deadline is required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        if (!members || members.length === 0) {
            console.log('❌ Validation failed: At least one member is required')
            return {
                success: false,
                message: "At least one member is required",
                code: httpStatusCode.BAD_REQUEST
            }
        }

        console.log('✅ All validations passed!')

        // Get user with tenant info
        console.log('🔍 Fetching user with tenant info...')
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
            console.log('❌ User not found')
            return {
                success: false,
                message: "User not found",
                code: httpStatusCode.NOT_FOUND
            }
        }
        console.log('✅ User found:', user.email)

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            console.log('❌ No tenant found')
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }
        console.log('🏢 Tenant found:', tenant.name, '(ID:', tenant.tenant_id, ')')

        // Verify member IDs
        console.log('🔍 Verifying member IDs...')
        const validMemberships = await prisma.membership.findMany({
            where: {
                membership_id: {
                    in: members
                },
                tenant_id: tenant.tenant_id
            },
            select: {
                membership_id: true,
                user_id: true
            }
        })

        console.log('✅ Valid memberships found:', validMemberships.length)
        console.log('📋 Valid Membership IDs:', validMemberships.map(m => m.membership_id))

        const validMemberIds = validMemberships.map(m => m.membership_id)
        const invalidMembers = members.filter((id: string) => !validMemberIds.includes(id))

        if (invalidMembers.length > 0) {
            console.log('❌ Invalid members found:', invalidMembers)
            return {
                success: false,
                message: `Invalid member IDs: ${invalidMembers.join(', ')}`,
                code: httpStatusCode.BAD_REQUEST
            }
        }
        console.log('✅ All members are valid')

        // Get uploaded file path
        const documentUrl = (req as any).file ? `/uploads/events/${(req as any).file.filename}` : null
        console.log('📎 Document URL:', documentUrl)

        // ✅ Step 1: Create beneficiary FIRST
        let beneficiaryId = null
        console.log('🔄 Step 1: Creating beneficiary...')
        
        if (beneficiaryName && beneficiaryName.trim() !== '') {
            console.log('📝 Beneficiary Name provided:', beneficiaryName)
            console.log('📝 Beneficiary Relationship:', beneficiaryRelationship)
            console.log('📝 Associating with membership ID:', validMemberIds[0])
            
            try {
                const beneficiary = await prisma.beneficiary.create({
                    data: {
                        tenant_id: tenant.tenant_id,
                        membership_id: validMemberIds[0],
                        name: beneficiaryName.trim(),
                        relationship: beneficiaryRelationship || null,
                        contact_info: null,
                        dob: null
                    }
                })
                beneficiaryId = beneficiary.beneficiary_id
                console.log('✅ Beneficiary created successfully!')
                console.log('📋 Beneficiary ID:', beneficiaryId)
                console.log('📋 Beneficiary Name:', beneficiary.name)
                console.log('📋 Beneficiary Relationship:', beneficiary.relationship)
                console.log('📋 Beneficiary Tenant ID:', beneficiary.tenant_id)
                console.log('📋 Beneficiary Membership ID:', beneficiary.membership_id)
            } catch (error) {
                console.log('❌ Failed to create beneficiary:', error)
                return {
                    success: false,
                    message: "Failed to create beneficiary: " + (error as any).message,
                    code: httpStatusCode.INTERNAL_SERVER_ERROR
                }
            }
        } else {
            console.log('ℹ️ No beneficiary name provided, skipping beneficiary creation')
        }

        // ✅ Step 2: Create event WITH beneficiary_id
        console.log('🔄 Step 2: Creating event...')
        console.log('📋 Event Data:')
        console.log('  - Tenant ID:', tenant.tenant_id)
        console.log('  - Created By:', userId)
        console.log('  - Beneficiary ID:', beneficiaryId)
        console.log('  - Title:', title)
        console.log('  - Fixed Amount:', fixedAmount)
        console.log('  - Deadline:', deadline)
        console.log('  - Document URL:', documentUrl)

        const result = await prisma.$transaction(async (prisma) => {
            console.log('📦 Starting database transaction...')
            
            const event = await prisma.fundraisingEvent.create({
                data: {
                    tenant_id: tenant.tenant_id,
                    created_by: userId,
                    beneficiary_id: beneficiaryId,
                    purpose: title,
                    fixed_amount: Number(fixedAmount),
                    deadline: new Date(deadline),
                    status: 'active',
                    supporting_doc_url: documentUrl,
                    created_at: new Date()
                }
            })
            console.log('✅ Event created successfully!')
            console.log('📋 Event ID:', event.event_id)
            console.log('📋 Event Beneficiary ID:', event.beneficiary_id)

            // Create event members
            console.log('🔄 Creating event members...')
            console.log('📋 Number of members:', validMemberIds.length)
            
            const eventMembers = []
            for (const membershipId of validMemberIds) {
                console.log(`📝 Creating event member for membership ID: ${membershipId}`)
                const eventMember = await prisma.eventMember.create({
                    data: {
                        event_id: event.event_id,
                        membership_id: membershipId,
                        amount_due: Number(fixedAmount),
                        status: 'pending'
                    }
                })
                eventMembers.push(eventMember)
                console.log(`✅ Event member created: ${eventMember.event_member_id}`)
            }
            console.log('✅ All event members created successfully!')

            // Create audit log
            console.log('🔄 Creating audit log...')
            const auditLog = await prisma.auditLog.create({
                data: {
                    tenant_id: tenant.tenant_id,
                    user_id: userId,
                    action: 'EVENT_CREATED',
                    entity_type: 'fundraising_event',
                    entity_id: event.event_id,
                    details: {
                        title,
                        amount: fixedAmount,
                        deadline,
                        memberCount: validMemberIds.length,
                        beneficiaryName: beneficiaryName || null,
                        beneficiaryRelationship: beneficiaryRelationship || null,
                        beneficiaryId: beneficiaryId
                    },
                    created_at: new Date()
                }
            })
            console.log('✅ Audit log created:', auditLog.log_id)

            return { event, eventMembers }
        })

        console.log('🎉 Event creation completed successfully!')
        console.log('📊 Summary:')
        console.log('  - Event ID:', result.event.event_id)
        console.log('  - Member Count:', result.eventMembers.length)
        console.log('  - Document URL:', documentUrl)
        console.log('  - Beneficiary ID:', beneficiaryId)
        console.log('  - Beneficiary Name:', beneficiaryName || null)
        console.log('========================================')
        console.log('✅ PROCESS COMPLETED')
        console.log('========================================')

        return {
            success: true,
            message: `Event "${title}" created successfully with ${result.eventMembers.length} members`,
            data: {
                event: result.event,
                memberCount: result.eventMembers.length,
                documentUrl: documentUrl,
                beneficiaryId: beneficiaryId,
                beneficiaryName: beneficiaryName || null
            }
        }

    } catch (error: any) {
        console.log('========================================')
        console.log('❌ ERROR IN EVENT CREATION')
        console.log('========================================')
        console.log('Error Details:', error)
        console.log('Error Message:', error.message)
        console.log('Error Stack:', error.stack)
        console.log('========================================')
        
        return {
            success: false,
            message: error.message || "Failed to create event",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}
/**
 * Get all events for a tenant
 */
export const getEventsService = async (req: Request) => {
    try {
        const userId = (req as any).currentUser
        const { status, page = 1, limit = 10 } = req.query

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

        const whereClause: any = {
            tenant_id: tenant.tenant_id
        }

        if (status && status !== 'all') {
            whereClause.status = status
        }

        const skip = (Number(page) - 1) * Number(limit)
        const take = Number(limit)

        const [events, total] = await Promise.all([
            prisma.fundraisingEvent.findMany({
                where: whereClause,
                include: {
                    beneficiary: {
                        select: {
                            beneficiary_id: true,
                            name: true,
                            relationship: true
                        }
                    },
                    event_members: {
                        include: {
                            membership: {
                                include: {
                                    user: {
                                        select: {
                                            user_id: true,
                                            email: true,
                                            full_name: true
                                        }
                                    }
                                }
                            },
                            contributions: true
                        }
                    },
                    creator: {
                        select: {
                            user_id: true,
                            email: true,
                            full_name: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                },
                skip,
                take
            }),
            prisma.fundraisingEvent.count({
                where: whereClause
            })
        ])

        const formattedEvents = events.map(event => {
            const totalCollected = event.event_members.reduce((sum, em) => {
                return sum + em.contributions.reduce((s, c) => s + Number(c.amount), 0)
            }, 0)

            const totalMembers = event.event_members.length
            const paidCount = event.event_members.filter(em => 
                em.contributions.reduce((s, c) => s + Number(c.amount), 0) >= Number(em.amount_due)
            ).length
            const pendingCount = event.event_members.filter(em => 
                em.contributions.reduce((s, c) => s + Number(c.amount), 0) < Number(em.amount_due) &&
                em.status !== 'pending'
            ).length
            const overdueCount = event.event_members.filter(em => 
                em.contributions.reduce((s, c) => s + Number(c.amount), 0) < Number(em.amount_due) &&
                new Date(event.deadline) < new Date()
            ).length

            return {
                id: event.event_id,
                title: event.purpose,
                description: event.purpose,
                fixedAmount: Number(event.fixed_amount),
                deadline: event.deadline,
                status: event.status,
                totalCollected,
                totalMembers,
                paidCount,
                pendingCount,
                overdueCount,
                createdAt: event.created_at,
                creatorName: event.creator.full_name || 'Unknown',
                beneficiary: event.beneficiary ? {
                    id: event.beneficiary.beneficiary_id,
                    name: event.beneficiary.name,
                    relationship: event.beneficiary.relationship
                } : null
            }
        })

        return {
            success: true,
            message: "Events fetched successfully",
            data: formattedEvents,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        }

    } catch (error: any) {
        console.error("Get events error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch events",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Get event by ID with details
 */
export const getEventByIdService = async (req: Request) => {
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

        // Get event with beneficiary
        const event = await prisma.fundraisingEvent.findFirst({
            where: {
                event_id: id,
                tenant_id: tenant.tenant_id
            },
            include: {
                beneficiary: {
                    select: {
                        beneficiary_id: true,
                        name: true,
                        relationship: true,
                        contact_info: true
                    }
                },
                event_members: {
                    include: {
                        membership: {
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
                        contributions: true
                    }
                },
                creator: {
                    select: {
                        user_id: true,
                        email: true,
                        full_name: true
                    }
                }
            }
        })

        if (!event) {
            return {
                success: false,
                message: "Event not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Calculate totals
        let totalCollected = 0
        const memberContributions = event.event_members.map(em => {
            const paid = em.contributions.reduce((sum, c) => sum + Number(c.amount), 0)
            totalCollected += paid
            
            const latestContribution = em.contributions[em.contributions.length - 1]

            return {
                id: em.event_member_id,
                memberName: em.membership.user.full_name || 'Unknown',
                memberEmail: em.membership.user.email,
                amountDue: Number(em.amount_due),
                amountPaid: paid,
                status: paid >= Number(em.amount_due) ? 'paid' : 
                         new Date(event.deadline) < new Date() ? 'overdue' : 'pending',
                paymentMethod: latestContribution?.payment_method || undefined,
                paymentDate: latestContribution?.paid_at || undefined,
                contributionId: latestContribution?.contribution_id || undefined
            }
        })

        const totalMembers = event.event_members.length
        const paidCount = memberContributions.filter(m => m.status === 'paid').length
        const pendingCount = memberContributions.filter(m => m.status === 'pending').length
        const overdueCount = memberContributions.filter(m => m.status === 'overdue').length

        return {
            success: true,
            message: "Event fetched successfully",
            data: {
                id: event.event_id,
                title: event.purpose,
                description: event.purpose,
                fixedAmount: Number(event.fixed_amount),
                deadline: event.deadline,
                status: event.status,
                totalCollected,
                totalMembers,
                paidCount,
                pendingCount,
                overdueCount,
                createdAt: event.created_at,
                creatorName: event.creator.full_name || 'Unknown',
                // ✅ Return beneficiary data
                beneficiary: event.beneficiary ? {
                    id: event.beneficiary.beneficiary_id,
                    name: event.beneficiary.name,
                    relationship: event.beneficiary.relationship,
                    contactInfo: event.beneficiary.contact_info
                } : null,
                supportingDocUrl: event.supporting_doc_url,
                contributions: memberContributions
            }
        }

    } catch (error: any) {
        console.error("Get event by id error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch event",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Update event
 */
export const updateEventService = async (req: Request) => {
    try {
        const { id } = req.params
        const userId = (req as any).currentUser
        const {
            title,
            description,
            fixedAmount,
            deadline,
            status,
            beneficiaryName,
            beneficiaryRelationship
        }: UpdateEventPayload = req.body

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

        // Check if event exists
        const existingEvent = await prisma.fundraisingEvent.findFirst({
            where: {
                event_id: id,
                tenant_id: tenant.tenant_id
            }
        })

        if (!existingEvent) {
            return {
                success: false,
                message: "Event not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Build update data
        const updateData: any = {}
        if (title) updateData.purpose = title
        if (fixedAmount) updateData.fixed_amount = fixedAmount
        if (deadline) updateData.deadline = new Date(deadline)
        if (status) updateData.status = status

        // Update event
        const updatedEvent = await prisma.fundraisingEvent.update({
            where: { event_id: id },
            data: updateData
        })

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'EVENT_UPDATED',
                entity_type: 'fundraising_event',
                entity_id: id,
                details: {
                    title,
                    status,
                    amount: fixedAmount,
                    deadline
                },
                created_at: new Date()
            }
        })

        return {
            success: true,
            message: "Event updated successfully",
            data: updatedEvent
        }

    } catch (error: any) {
        console.error("Update event error:", error)
        return {
            success: false,
            message: error.message || "Failed to update event",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Delete event
 */
export const deleteEventService = async (req: Request) => {
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

        // Check if event exists
        const existingEvent = await prisma.fundraisingEvent.findFirst({
            where: {
                event_id: id,
                tenant_id: tenant.tenant_id
            }
        })

        if (!existingEvent) {
            return {
                success: false,
                message: "Event not found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Delete event (cascade will handle event_members and contributions)
        await prisma.$transaction([
            prisma.eventMember.deleteMany({
                where: { event_id: id }
            }),
            prisma.fundraisingEvent.delete({
                where: { event_id: id }
            })
        ])

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'EVENT_DELETED',
                entity_type: 'fundraising_event',
                entity_id: id,
                details: {
                    title: existingEvent.purpose
                },
                created_at: new Date()
            }
        })

        return {
            success: true,
            message: "Event deleted successfully"
        }

    } catch (error: any) {
        console.error("Delete event error:", error)
        return {
            success: false,
            message: error.message || "Failed to delete event",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

/**
 * Get event summary for dashboard
 */
export const getEventSummaryService = async (req: Request) => {
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

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant) {
            return {
                success: false,
                message: "No tenant found",
                code: httpStatusCode.NOT_FOUND
            }
        }

        // Get all events
        const events = await prisma.fundraisingEvent.findMany({
            where: {
                tenant_id: tenant.tenant_id
            },
            include: {
                event_members: {
                    include: {
                        contributions: true
                    }
                }
            }
        })

        const summary = {
            total: events.length,
            active: events.filter(e => e.status === 'active').length,
            completed: events.filter(e => e.status === 'completed').length,
            cancelled: events.filter(e => e.status === 'cancelled').length,
            totalCollected: events.reduce((sum, e) => {
                return sum + e.event_members.reduce((s, em) => {
                    return s + em.contributions.reduce((c, cont) => c + Number(cont.amount), 0)
                }, 0)
            }, 0)
        }

        return {
            success: true,
            message: "Event summary fetched successfully",
            data: summary
        }

    } catch (error: any) {
        console.error("Get event summary error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch event summary",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}