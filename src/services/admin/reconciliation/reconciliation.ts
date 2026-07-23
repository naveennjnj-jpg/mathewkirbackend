// services/admin/reconciliation/reconciliation.ts
import { Request } from "express";
import prisma from "../../../lib/prisma";
import { httpStatusCode } from "../../../lib/constant";

/**
 * Get all transactions (no filters applied)
 */
export const getAllTransactionsService = async (req: Request) => {
  try {
    // Fetch all contributions
    const contributions = await prisma.contribution.findMany({
      include: {
        tenant: {
          select: {
            tenant_id: true,
            name: true
          }
        },
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
        },
        verifier: {
          select: {
            full_name: true
          }
        }
      }
    });

    // Fetch all payouts
    const payouts = await prisma.payout.findMany({
      include: {
        tenant: {
          select: {
            tenant_id: true,
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
        beneficiary: {
          select: {
            name: true
          }
        },
        recorder: {
          select: {
            full_name: true
          }
        }
      }
    });

    // Transform contributions to transactions
    const contributionTransactions = contributions.map(c => ({
      id: c.contribution_id,
      tenantId: c.tenant_id,
      tenantName: c.tenant?.name || 'Unknown',
      date: c.created_at,
      amount: Number(c.amount),
      type: 'collection' as const,
      status: c.status as 'completed' | 'pending' | 'failed',
      reference: c.payment_reference || `CONT-${c.contribution_id.slice(0, 8)}`,
      description: `Contribution from ${c.event_member?.membership?.user?.full_name || 'Unknown'}`,
      paymentMethod: c.payment_method || undefined,
      verifiedBy: c.verified_by || undefined,
      verifierName: c.verifier?.full_name || undefined,
      createdAt: c.created_at
    }));

    // Transform payouts to transactions
    const payoutTransactions = payouts.map(p => ({
      id: p.payout_id,
      tenantId: p.tenant_id,
      tenantName: p.tenant?.name || 'Unknown',
      date: p.payout_date || p.created_at || new Date(),
      amount: Number(p.amount),
      type: 'payout' as const,
      status: p.status as 'completed' | 'pending' | 'failed',
      reference: `PAY-${p.payout_id.slice(0, 8)}`,
      description: `Payout to ${p.beneficiary?.name || 'Unknown beneficiary'}`,
      paymentMethod: undefined,
      verifiedBy: p.recorded_by || undefined,
      verifierName: p.recorder?.full_name || undefined,
      createdAt: p.created_at || new Date()
    }));

    // Combine all transactions
    const allTransactions = [...contributionTransactions, ...payoutTransactions];

    // Get all tenants for filter
    const tenants = await prisma.tenant.findMany({
      where: {
        status: 'active'
      },
      select: {
        tenant_id: true,
        name: true,
        subdomain: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Get unique statuses
    const statuses = Array.from(new Set(allTransactions.map(t => t.status)));

    return {
      success: true,
      message: "All transactions fetched successfully",
      data: {
        transactions: allTransactions,
        tenants: tenants.map(t => ({
          id: t.tenant_id,
          name: t.name,
          subdomain: t.subdomain
        })),
        statuses: statuses.filter(s => s !== null),
        types: ['collection', 'payout']
      }
    };

  } catch (error: any) {
    console.error("Get all transactions error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch transactions",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};