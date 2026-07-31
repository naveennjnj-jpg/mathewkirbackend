// services/member/member.ts
import { Request } from "express"
import bcrypt from "bcryptjs"
import jwt, { JwtPayload } from 'jsonwebtoken'
import { customAlphabet } from "nanoid"
import prisma from "../../lib/prisma"
import { httpStatusCode } from "../../lib/constant"
import { sendPasswordResetEmail } from "../../utils/mails/mail"
import { generateAuthToken, hashPassword, comparePassword, generateNumericOTP } from "../../utils/auth-utils"

// Types
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
  deadline: string;  // Always string (ISO format from DateTime)
  description?: string;
  status: 'active' | 'upcoming' | 'ended';
  raisedAmount?: number;
  targetAmount?: number;
  participantCount?: number;
}

interface ServiceResponse {
  success: boolean;
  message: string;
  code?: number;
  data?: any;
}

// ============================================
// DASHBOARD SERVICE
// ============================================

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

        const membership = user.memberships[0]
        const tenant = membership?.tenant

        if (!tenant || !membership) {
            return {
                success: false,
                message: "No active membership found for this user",
                code: httpStatusCode.NOT_FOUND
            }
        }

        const now = new Date()

        // 1. Get Outstanding Dues
        const eventMembers = await prisma.eventMember.findMany({
            where: {
                membership_id: membership.membership_id,
                status: { in: ['pending', 'overdue'] }
            },
            include: {
                event: {
                    select: {
                        purpose: true,
                        fixed_amount: true,
                        deadline: true
                    }
                },
                contributions: {
                    where: {
                        status: 'paid'
                    }
                }
            }
        })

        const duesItems = eventMembers.map(em => {
            const totalPaid = em.contributions.reduce((sum, c) => sum + Number(c.amount), 0)
            const amountDue = Number(em.amount_due) - totalPaid
            
            let status = 'pending'
            if (em.event.deadline && new Date(em.event.deadline) < now) {
                status = 'overdue'
            }
            if (amountDue <= 0) {
                status = 'paid'
            }

            return {
                id: em.event_member_id,
                description: em.event.purpose || 'Fundraising Event',
                amount: amountDue > 0 ? amountDue : 0,
                dueDate: em.event.deadline || new Date().toISOString(),
                status
            }
        }).filter(item => item.status !== 'paid')

        const totalAmount = duesItems.reduce((sum, item) => sum + item.amount, 0)
        const overdueItems = duesItems.filter(item => item.status === 'overdue')
        const pendingItems = duesItems.filter(item => item.status === 'pending')

        let overallStatus = 'upcoming'
        if (overdueItems.length > 0) {
            overallStatus = 'overdue'
        } else if (pendingItems.length > 0) {
            overallStatus = 'upcoming'
        }

        const nearestDue = duesItems.length > 0 
            ? duesItems.reduce((a, b) => a.dueDate < b.dueDate ? a : b).dueDate
            : new Date().toISOString()

        const outstandingDues = {
            totalAmount,
            dueDate: nearestDue,
            status: overallStatus,
            items: duesItems
        }

        // 2. Get Active Fundraising Events
        const activeEventsData = await prisma.fundraisingEvent.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                status: { in: ['active', 'upcoming'] }
            },
            include: {
                event_members: {
                    where: {
                        membership_id: membership.membership_id
                    },
                    include: {
                        contributions: true
                    }
                },
                beneficiary: true
            },
            orderBy: {
                created_at: 'desc'
            },
            take: 5
        })

        const activeEvents = await Promise.all(activeEventsData.map(async (event) => {
            const allContributions = await prisma.contribution.aggregate({
                where: {
                    tenant_id: tenant.tenant_id,
                    event_member: {
                        event_id: event.event_id
                    },
                    status: 'paid'
                },
                _sum: {
                    amount: true
                }
            })

            const raisedAmount = Number(allContributions._sum.amount) || 0
            
            const memberEvent = event.event_members[0]
            const memberPaid = memberEvent?.contributions
                .filter(c => c.status === 'paid')
                .reduce((sum, c) => sum + Number(c.amount), 0) || 0

            return {
                id: event.event_id,
                name: event.purpose || 'Fundraising Event',
                amount: Number(event.fixed_amount),
                deadline: event.deadline || new Date().toISOString(),
                status: event.status,
                raisedAmount,
                targetAmount: Number(event.fixed_amount) * 10,
                memberContribution: memberPaid
            }
        }))

        // 3. Get Recent Notifications
        const notificationsData = await prisma.notification.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                user_id: userId
            },
            orderBy: {
                sent_at: 'desc'
            },
            take: 5
        })

        const notifications = notificationsData.map(n => ({
            id: n.notification_id,
            title: n.type || 'Notification',
            message: n.message || '',
            type: mapNotificationType(n.type),
            date: n.sent_at || new Date().toISOString(),
            read: n.read_at !== null
        }))

        const memberName = user.full_name || 'Member'

        return {
            success: true,
            message: "Dashboard data fetched successfully",
            data: {
                outstandingDues,
                activeEvents,
                notifications,
                memberName
            }
        }

    } catch (error: any) {
        console.error("Dashboard error:", error)
        return {
            success: false,
            message: error.message || "Failed to fetch dashboard data",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        }
    }
}

// Helper: Map notification type
function mapNotificationType(type: string | null): string {
    const mapping: Record<string, string> = {
        'payment': 'success',
        'payment_reminder': 'warning',
        'event_created': 'info',
        'event_reminder': 'info',
        'system': 'info',
        'error': 'error'
    }
    return mapping[type || ''] || 'info'
}


export const getContributionsService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;

        const user = await prisma.user.findUnique({
            where: { user_id: userId },
            include: {
                memberships: {
                    where: {
                        status: 'active'
                    },
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

        const eventMembers = await prisma.eventMember.findMany({
            where: {
                membership_id: membership.membership_id
            },
            include: {
                event: {
                    select: {
                        event_id: true,
                        purpose: true,
                        fixed_amount: true,
                        deadline: true,
                        status: true
                    }
                },
                contributions: {
                    orderBy: {
                        created_at: 'desc'
                    }
                }
            }
        });

        const contributions: ContributionResponse[] = [];

        eventMembers.forEach((em: any) => {
            const event = em.event;
            const eventContributions = em.contributions || [];

            if (eventContributions.length > 0) {
                eventContributions.forEach((contribution: any) => {
                    contributions.push({
                        id: contribution.contribution_id,
                        eventName: event.purpose || 'Fundraising Event',
                        amount: Number(contribution.amount),
                        date: contribution.paid_at || contribution.created_at || new Date().toISOString(),
                        paymentMethod: mapPaymentMethod(contribution.payment_method),
                        status: contribution.status || 'pending',
                        transactionId: contribution.payment_reference,
                        description: event.purpose || undefined
                    });
                });
            } else {
                const amountDue = Number(em.amount_due) || 0;
                
                if (amountDue > 0) {
                    let status = 'pending';
                    if (event.deadline && new Date(event.deadline) < new Date()) {
                        status = 'overdue';
                    }

                    contributions.push({
                        id: em.event_member_id,
                        eventName: event.purpose || 'Fundraising Event',
                        amount: amountDue,
                        date: event.deadline || new Date().toISOString(),
                        paymentMethod: 'other',
                        status: status,
                        transactionId: undefined,
                        description: event.purpose || undefined
                    });
                }
            }
        });

        contributions.sort((a: ContributionResponse, b: ContributionResponse) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        return {
            success: true,
            message: "Contributions fetched successfully",
            data: {
                contributions
            }
        };

    } catch (error: any) {
        console.error("Contributions error:", error);
        return {
            success: false,
            message: error.message || "Failed to fetch contributions",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

// Helper: Map payment method
function mapPaymentMethod(method: string | null): string {
    const mapping: Record<string, string> = {
        'cash': 'cash',
        'card': 'card',
        'credit_card': 'card',
        'debit_card': 'card',
        'bank_transfer': 'bank_transfer',
        'mobile_money': 'mobile_money',
        'paypal': 'other',
        'stripe': 'other',
        'cashapp': 'other',
        'venmo': 'other',
        'zelle': 'other',
    };
    return mapping[method || ''] || 'other';
}


// ============================================
// EVENTS SERVICE
// ============================================

/**
 * Get Events Service for Member
 */
export const getEventsService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;

        // Get user with memberships
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

        // Get all events for this tenant
        const events = await prisma.fundraisingEvent.findMany({
            where: {
                tenant_id: tenant.tenant_id
            },
            include: {
                event_members: {
                    include: {
                        contributions: {
                            where: {
                                status: 'paid'
                            }
                        }
                    }
                },
                beneficiary: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        // Transform events
        const formattedEvents: EventResponse[] = events.map((event) => {
            // Get total raised from contributions
            const raisedAmount = event.event_members.reduce((total, em) => {
                const paidContributions = em.contributions.filter(c => c.status === 'paid');
                const eventTotal = paidContributions.reduce((sum, c) => sum + Number(c.amount), 0);
                return total + eventTotal;
            }, 0);
            
            // Get participant count (members who have this event)
            const participantCount = event.event_members.length;

            // Determine status
            let status: 'active' | 'upcoming' | 'ended' = 'active';
            if (event.deadline && new Date(event.deadline) < new Date()) {
                status = 'ended';
            } else if (event.status === 'upcoming') {
                status = 'upcoming';
            }

            return {
                id: event.event_id,
                name: event.purpose || 'Fundraising Event',
                amount: Number(event.fixed_amount),
                deadline: event.deadline ? new Date(event.deadline).toISOString() : new Date().toISOString(),
                description: event.purpose || undefined,
                status: status,
                raisedAmount: raisedAmount,
                targetAmount: Number(event.fixed_amount) * 10, // Example target
                participantCount: participantCount
            };
        });

        return {
            success: true,
            message: "Events fetched successfully",
            data: {
                events: formattedEvents
            }
        };

    } catch (error: any) {
        console.error("Events error:", error);
        return {
            success: false,
            message: error.message || "Failed to fetch events",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};


// ============================================
// PAYMENT SUBMISSION SERVICE
// ============================================

/**
 * Submit Payment Service
 */

export const submitPaymentService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        // Add proofFileUrl to the destructured body
        const { eventId, amount, paymentMethod, transactionId, proofFileUrl, notes } = req.body;

        // Validate required fields
        if (!eventId) {
            return {
                success: false,
                message: "Event ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!amount) {
            return {
                success: false,
                message: "Amount is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!paymentMethod) {
            return {
                success: false,
                message: "Payment method is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!transactionId || transactionId.trim() === '') {
            return {
                success: false,
                message: "Transaction ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get user with memberships
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

        // Get the event
        const event = await prisma.fundraisingEvent.findFirst({
            where: {
                event_id: eventId,
                tenant_id: tenant.tenant_id
            },
            include: {
                event_members: {
                    where: {
                        membership_id: membership.membership_id
                    }
                }
            }
        });

        if (!event) {
            return {
                success: false,
                message: "Event not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        if (event.deadline && new Date(event.deadline) < new Date()) {
            return {
                success: false,
                message: "This event has ended and no longer accepts contributions",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Get or create event member
        let eventMember = event.event_members[0];

        if (!eventMember) {
            // Create event member if it doesn't exist
            eventMember = await prisma.eventMember.create({
                data: {
                    event_id: event.event_id,
                    membership_id: membership.membership_id,
                    amount_due: Number(amount),
                    status: 'pending'
                }
            });
        }

        // Create contribution
        const contributionData: any = {
            tenant_id: tenant.tenant_id,
            event_member_id: eventMember.event_member_id,
            amount: Number(amount),
            payment_method: paymentMethod,
            payment_reference: transactionId,
            status: 'pending',
            created_at: new Date()
        };

        // Add proof file URL if provided (from separate upload)
        if (proofFileUrl) {
            contributionData.proof_file = proofFileUrl;
        }

        if (notes) {
            contributionData.notes = notes;
        }

        const contribution = await prisma.contribution.create({
            data: contributionData
        });

        // Update event member status
        await prisma.eventMember.update({
            where: {
                event_member_id: eventMember.event_member_id
            },
            data: {
                status: 'pending'
            }
        });

        // Create notification for treasurer
        await prisma.notification.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                type: 'payment_submitted',
                message: `Payment of ${amount} submitted for ${event.purpose || 'event'}`,
                sent_at: new Date()
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'Payment Submitted',
                entity_type: 'Contribution',
                entity_id: contribution.contribution_id,
                details: {
                    eventId: event.event_id,
                    eventName: event.purpose,
                    amount: Number(amount),
                    paymentMethod: paymentMethod,
                    transactionId: transactionId,
                    proofFileUrl: proofFileUrl,
                    status: 'pending'
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Payment submitted successfully. Please wait for verification.",
            data: {
                contributionId: contribution.contribution_id,
                status: 'pending',
                amount: Number(amount),
                eventName: event.purpose
            }
        };

    } catch (error: any) {
        console.error("Payment submission error:", error);
        return {
            success: false,
            message: error.message || "Failed to submit payment",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Get All Beneficiaries Service
 */
export const getBeneficiariesService = async (req: Request): Promise<ServiceResponse> => {
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

        // Get all beneficiaries for this tenant and membership
        const beneficiaries = await prisma.beneficiary.findMany({
            where: {
                tenant_id: tenant.tenant_id,
                membership_id: membership.membership_id
            }
        });

        // Transform to response format
        const formattedBeneficiaries = beneficiaries.map((beneficiary: any) => ({
            id: beneficiary.beneficiary_id,
            name: beneficiary.name,
            relationship: beneficiary.relationship || 'other',
            dateOfBirth: beneficiary.dob ? new Date(beneficiary.dob).toISOString().split('T')[0] : '',
            contactInfo: {
                phone: beneficiary.contact_info || '',
                email: '' // Add if you have email field in beneficiary
            },
            createdAt: beneficiary.created_at,
            isActive: true
        }));

        return {
            success: true,
            message: "Beneficiaries fetched successfully",
            data: {
                beneficiaries: formattedBeneficiaries
            }
        };

    } catch (error: any) {
        console.error("Get beneficiaries error:", error);
        return {
            success: false,
            message: error.message || "Failed to fetch beneficiaries",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Create Beneficiary Service
 */
export const createBeneficiaryService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { name, relationship, dateOfBirth, phone, email, contactInfo } = req.body;

        // Validate required fields
        if (!name || name.trim() === '') {
            return {
                success: false,
                message: "Name is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!relationship) {
            return {
                success: false,
                message: "Relationship is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!dateOfBirth) {
            return {
                success: false,
                message: "Date of birth is required",
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

        // Prepare contact info
        const contactInfoStr = phone || contactInfo?.phone || '';

        // Create beneficiary
        const beneficiary = await prisma.beneficiary.create({
            data: {
                tenant_id: tenant.tenant_id,
                membership_id: membership.membership_id,
                name: name,
                relationship: relationship,
                dob: new Date(dateOfBirth),
                contact_info: contactInfoStr
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'Beneficiary Created',
                entity_type: 'Beneficiary',
                entity_id: beneficiary.beneficiary_id,
                details: {
                    name: name,
                    relationship: relationship
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Beneficiary created successfully",
            data: {
                id: beneficiary.beneficiary_id,
                name: beneficiary.name,
                relationship: beneficiary.relationship,
                dateOfBirth: beneficiary.dob,
                contactInfo: {
                    phone: beneficiary.contact_info || ''
                },
                isActive: true
            }
        };

    } catch (error: any) {
        console.error("Create beneficiary error:", error);
        return {
            success: false,
            message: error.message || "Failed to create beneficiary",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Update Beneficiary Service
 */
export const updateBeneficiaryService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { beneficiaryId } = req.params;
        const { name, relationship, dateOfBirth, phone, email, contactInfo } = req.body;

        if (!beneficiaryId) {
            return {
                success: false,
                message: "Beneficiary ID is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        // Validate required fields
        if (!name || name.trim() === '') {
            return {
                success: false,
                message: "Name is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!relationship) {
            return {
                success: false,
                message: "Relationship is required",
                code: httpStatusCode.BAD_REQUEST
            };
        }

        if (!dateOfBirth) {
            return {
                success: false,
                message: "Date of birth is required",
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

        // Check if beneficiary exists and belongs to this tenant
        const existingBeneficiary = await prisma.beneficiary.findFirst({
            where: {
                beneficiary_id: beneficiaryId,
                tenant_id: tenant.tenant_id,
                membership_id: membership.membership_id
            }
        });

        if (!existingBeneficiary) {
            return {
                success: false,
                message: "Beneficiary not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Prepare contact info
        const contactInfoStr = phone || contactInfo?.phone || '';

        // Update beneficiary
        const updatedBeneficiary = await prisma.beneficiary.update({
            where: { beneficiary_id: beneficiaryId },
            data: {
                name: name,
                relationship: relationship,
                dob: new Date(dateOfBirth),
                contact_info: contactInfoStr
            }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'Beneficiary Updated',
                entity_type: 'Beneficiary',
                entity_id: beneficiaryId,
                details: {
                    name: name,
                    relationship: relationship
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Beneficiary updated successfully",
            data: {
                id: updatedBeneficiary.beneficiary_id,
                name: updatedBeneficiary.name,
                relationship: updatedBeneficiary.relationship,
                dateOfBirth: updatedBeneficiary.dob,
                contactInfo: {
                    phone: updatedBeneficiary.contact_info || ''
                },
                isActive: true
            }
        };

    } catch (error: any) {
        console.error("Update beneficiary error:", error);
        return {
            success: false,
            message: error.message || "Failed to update beneficiary",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};

/**
 * Delete Beneficiary Service
 */
export const deleteBeneficiaryService = async (req: Request): Promise<ServiceResponse> => {
    try {
        const userId = (req as any).currentUser;
        const { beneficiaryId } = req.params;

        if (!beneficiaryId) {
            return {
                success: false,
                message: "Beneficiary ID is required",
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

        // Check if beneficiary exists and belongs to this tenant
        const existingBeneficiary = await prisma.beneficiary.findFirst({
            where: {
                beneficiary_id: beneficiaryId,
                tenant_id: tenant.tenant_id,
                membership_id: membership.membership_id
            }
        });

        if (!existingBeneficiary) {
            return {
                success: false,
                message: "Beneficiary not found",
                code: httpStatusCode.NOT_FOUND
            };
        }

        // Delete beneficiary
        await prisma.beneficiary.delete({
            where: { beneficiary_id: beneficiaryId }
        });

        // Create audit log
        await prisma.auditLog.create({
            data: {
                tenant_id: tenant.tenant_id,
                user_id: userId,
                action: 'Beneficiary Deleted',
                entity_type: 'Beneficiary',
                entity_id: beneficiaryId,
                details: {
                    name: existingBeneficiary.name
                },
                created_at: new Date()
            }
        });

        return {
            success: true,
            message: "Beneficiary deleted successfully",
            data: {
                beneficiaryId: beneficiaryId
            }
        };

    } catch (error: any) {
        console.error("Delete beneficiary error:", error);
        return {
            success: false,
            message: error.message || "Failed to delete beneficiary",
            code: httpStatusCode.INTERNAL_SERVER_ERROR
        };
    }
};