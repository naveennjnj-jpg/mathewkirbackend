import { Request } from "express";
import prisma from "../../../../lib/prisma";
import { httpStatusCode } from "../../../../lib/constant";
import { hashPassword, generateNumericOTP } from "../../../../utils/auth-utils";
import {
  UserQueryParams,
  CreateUserPayload,
  UpdateUserPayload
} from "../../../../types/user";
import { sendTenantInviteEmail } from "../../../../utils/mails/email-service";

// ============================================
// USER SERVICES
// ============================================

/**
 * Get all users with pagination and filters
 */
export const getAllUsersService = async (req: Request) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = 'all',
      tenantId = 'all',
      status = 'all',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query as UserQueryParams;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause
    let where: any = {};

    // Search filter
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { full_name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Role filter - Only member and treasurer
    if (role !== 'all') {
      where.memberships = {
        some: {
          role: role // member or treasurer
        }
      };
    }

    // Tenant filter
    if (tenantId !== 'all') {
      where.memberships = {
        some: {
          tenant_id: tenantId
        }
      };
    }

    // Status filter
    if (status !== 'all') {
      where.memberships = {
        some: {
          status: status
        }
      };
    }

    // Only fetch users who have at least one membership
    where.memberships = {
      some: {
        ...(where.memberships?.some || {}),
        status: 'active'
      }
    };

    const total = await prisma.user.count({ where });

    const users = await prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: {
        [sortBy]: sortOrder
      },
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                tenant_id: true,
                name: true,
                subdomain: true,
                status: true
              }
            }
          }
        },
        _count: {
          select: {
            memberships: true,
            verified_contributions: true,
            created_events: true,
            payouts: true,
            notifications: true
          }
        }
      }
    });

    // Format users for response
    const formattedUsers = users.map(user => {
      // Get the primary membership (first active one)
      const primaryMembership = user.memberships.find(m => m.status === 'active') || user.memberships[0];

      // Determine role from membership
      let userRole = 'member'; // Default
      if (primaryMembership) {
        userRole = primaryMembership.role; // member or treasurer
      }

      return {
        id: user.user_id,
        name: user.full_name || 'Unknown',
        email: user.email,
        phone: user.phone,
        role: userRole, // member or treasurer
        tenant: primaryMembership?.tenant?.name || 'No Tenant',
        tenantId: primaryMembership?.tenant_id || null,
        tenantStatus: primaryMembership?.tenant?.status || null,
        status: primaryMembership?.status || 'inactive',
        joinedDate: primaryMembership?.joined_at || user.created_at,
        lastActive: user.created_at,
        isSuperAdmin: false,
        memberships: user.memberships.map(m => ({
          id: m.membership_id,
          tenantId: m.tenant_id,
          tenantName: m.tenant.name,
          tenantSubdomain: m.tenant.subdomain,
          role: m.role,
          status: m.status,
          joinedAt: m.joined_at
        })),
        stats: {
          memberships: user._count.memberships,
          verifiedContributions: user._count.verified_contributions,
          createdEvents: user._count.created_events,
          payouts: user._count.payouts,
          notifications: user._count.notifications
        },
        createdAt: user.created_at
      };
    });

    // Get all tenants for filter dropdown
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

    // Get unique roles from memberships (only member, treasurer)
    const roles = await prisma.membership.groupBy({
      by: ['role'],
      where: {
        role: {
          in: ['member', 'treasurer']
        }
      },
      _count: true
    });

    return {
      success: true,
      message: "Users fetched successfully",
      data: formattedUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      },
      filters: {
        tenants: tenants.map(t => ({
          id: t.tenant_id,
          name: t.name,
          subdomain: t.subdomain
        })),
        roles: roles.map(r => r.role) // ['member', 'treasurer']
      }
    };

  } catch (error: any) {
    console.error("Get all users error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch users",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};

// services/admin/user/user.ts (fixed getUserByIdService)

/**
 * Get user by ID
 */
export const getUserByIdService = async (id: string) => {
  try {
    const user = await prisma.user.findUnique({
      where: { user_id: id },
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                tenant_id: true,
                name: true,
                subdomain: true,
                status: true,
                brand_color: true,
                logo_url: true
              }
            }
          }
        },
        verified_contributions: {
          take: 10,
          orderBy: {
            created_at: 'desc'
          },
          include: {
            tenant: {
              select: {
                name: true
              }
            },
            event_member: {
              include: {
                event: {
                  select: {
                    purpose: true
                  }
                }
              }
            }
          }
        },
        created_events: {
          take: 10,
          orderBy: {
            created_at: 'desc'
          },
          include: {
            tenant: {
              select: {
                name: true
              }
            }
          }
        },
        payouts: {
          take: 10,
          orderBy: {
            payout_date: 'desc' // Changed from created_at to payout_date
          },
          include: {
            tenant: {
              select: {
                name: true
              }
            },
            beneficiary: {
              select: {
                name: true
              }
            }
          }
        },
        notifications: {
          take: 10,
          orderBy: {
            sent_at: 'desc'
          }
        },
        password_reset_tokens: {
          where: {
            used: false,
            expires_at: {
              gt: new Date()
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

    // Format user data
    const formattedUser = {
      id: user.user_id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      isSuperAdmin: user.is_super_admin,
      createdAt: user.created_at,
      memberships: user.memberships.map(m => ({
        membershipId: m.membership_id,
        tenantId: m.tenant_id,
        tenantName: m.tenant.name,
        tenantSubdomain: m.tenant.subdomain,
        tenantStatus: m.tenant.status,
        role: m.role,
        status: m.status,
        joinedAt: m.joined_at
      })),
      recentActivity: {
        verifiedContributions: user.verified_contributions,
        createdEvents: user.created_events,
        payouts: user.payouts,
        notifications: user.notifications
      },
      activeResetTokens: user.password_reset_tokens
    };

    return {
      success: true,
      message: "User fetched successfully",
      data: formattedUser
    };

  } catch (error: any) {
    console.error("Get user by id error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch user",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};
/**
 * Create new user
 */
export const createUserService = async (req: Request) => {
  try {
    const userId = (req as any).currentUser;
    const {
      fullName,
      email,
      role,
      tenantId,
      password
    }: CreateUserPayload = req.body;

    if (!fullName || !email || !role) {
      return {
        success: false,
        message: "Full name, email, and role are required",
        code: httpStatusCode.BAD_REQUEST
      };
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    let user = existingUser;
    let tempPassword: string = password ?? "";

    // If user doesn't exist, create them
    if (!user) {
      tempPassword = password || generateNumericOTP(8);
      const hashedPassword = await hashPassword(tempPassword);

      user = await prisma.user.create({
        data: {
          email,
          full_name: fullName,
          password_hash: hashedPassword,
          is_super_admin: role === 'superadmin',
          phone: null
        }
      });
    }

    // If tenant is provided and role is not superadmin, create membership
    if (tenantId && role !== 'superadmin') {
      const existingMembership = await prisma.membership.findUnique({
        where: {
          tenant_id_user_id: {
            tenant_id: tenantId,
            user_id: user.user_id
          }
        }
      });

      if (!existingMembership) {
        await prisma.membership.create({
          data: {
            tenant_id: tenantId,
            user_id: user.user_id,
            role: role,
            status: 'active',
            joined_at: new Date()
          }
        });
      }
    }

    // Create audit log
    if (userId) {
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action: 'USER_CREATED',
          entity_type: 'user',
          entity_id: user.user_id,
          details: {
            email,
            fullName,
            role,
            tenantId,
            createdBy: userId
          },
          created_at: new Date()
        }
      });
    }

    // Send invitation email if new user
    if (!existingUser) {
      try {
        const tenantDetails = tenantId
          ? await getTenantDetails(tenantId)
          : { name: "System", subdomain: "default" };

        await sendTenantInviteEmail({
          to: email,
          tempPassword,
          role,
          tenantName: tenantDetails.name,
          tenantSubdomain: tenantDetails.subdomain,
          invitedBy: "Admin",
        });
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // Don't fail user creation if email fails
      }
    }

    // Get the created user with memberships
    const createdUser = await prisma.user.findUnique({
      where: { user_id: user.user_id },
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    return {
      success: true,
      message: existingUser ? "User added to tenant successfully" : "User created and invited successfully",
      data: {
        user: createdUser,
        tempPassword: !existingUser ? tempPassword : undefined,
        isNewUser: !existingUser
      }
    };

  } catch (error: any) {
    console.error("Create user error:", error);
    return {
      success: false,
      message: error.message || "Failed to create user",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Update user
 */
export const updateUserService = async (payload: { id: string; userId: string; body: any }) => {
  try {
    const { id, userId, body } = payload;
    const { fullName, email, phone, role, tenantId, status, password } = body;

    const existingUser = await prisma.user.findUnique({
      where: { user_id: id },
      include: {
        memberships: true
      }
    });

    if (!existingUser) {
      return {
        success: false,
        message: "User not found",
        code: httpStatusCode.NOT_FOUND
      };
    }

    // Update user details
    const updateData: any = {};
    if (fullName) updateData.full_name = fullName;
    if (email) {
      const emailExists = await prisma.user.findFirst({
        where: {
          email,
          user_id: { not: id }
        }
      });
      if (emailExists) {
        return {
          success: false,
          message: "Email already in use",
          code: httpStatusCode.BAD_REQUEST
        };
      }
      updateData.email = email;
    }
    if (phone) updateData.phone = phone;
    if (password) {
      const hashedPassword = await hashPassword(password);
      updateData.password_hash = hashedPassword;
    }
    if (role === 'superadmin') {
      updateData.is_super_admin = true;
    } else if (role) {
      updateData.is_super_admin = false;
    }

    // Update user
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { user_id: id },
        data: updateData
      });
    }

    // Update membership if tenant and role provided
    if (tenantId && role && role !== 'superadmin') {
      const membership = await prisma.membership.findFirst({
        where: {
          user_id: id,
          tenant_id: tenantId
        }
      });

      if (membership) {
        await prisma.membership.update({
          where: { membership_id: membership.membership_id },
          data: {
            role: role,
            status: status || membership.status
          }
        });
      } else {
        await prisma.membership.create({
          data: {
            tenant_id: tenantId,
            user_id: id,
            role: role,
            status: status || 'active',
            joined_at: new Date()
          }
        });
      }
    } else if (status && tenantId) {
      // Update status only
      const membership = await prisma.membership.findFirst({
        where: {
          user_id: id,
          tenant_id: tenantId
        }
      });

      if (membership) {
        await prisma.membership.update({
          where: { membership_id: membership.membership_id },
          data: { status }
        });
      }
    }

    // Create audit log
    if (userId) {
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action: 'USER_UPDATED',
          entity_type: 'user',
          entity_id: id,
          details: {
            updatedFields: Object.keys(updateData),
            role,
            tenantId,
            status
          },
          created_at: new Date()
        }
      });
    }

    const updatedUser = await prisma.user.findUnique({
      where: { user_id: id },
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                name: true,
                subdomain: true
              }
            }
          }
        }
      }
    });

    return {
      success: true,
      message: "User updated successfully",
      data: updatedUser
    };

  } catch (error: any) {
    console.error("Update user error:", error);
    return {
      success: false,
      message: error.message || "Failed to update user",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Delete user (soft delete - deactivate)
 */
export const deleteUserService = async (payload: { id: string; userId: string }) => {
  try {
    const { id, userId } = payload;

    const user = await prisma.user.findUnique({
      where: { user_id: id },
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
        code: httpStatusCode.NOT_FOUND
      };
    }

    // Check if user is the only admin of any tenant
    for (const membership of user.memberships) {
      if (membership.role === 'admin') {
        const adminCount = await prisma.membership.count({
          where: {
            tenant_id: membership.tenant_id,
            role: 'admin'
          }
        });

        if (adminCount <= 1) {
          return {
            success: false,
            message: `Cannot delete user. They are the only admin of ${membership.tenant?.name || 'a tenant'}`,
            code: httpStatusCode.BAD_REQUEST
          };
        }
      }
    }

    // Deactivate memberships instead of deleting
    await prisma.membership.updateMany({
      where: { user_id: id },
      data: { status: 'inactive' }
    });

    // Create audit log
    if (userId) {
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action: 'USER_DELETED',
          entity_type: 'user',
          entity_id: id,
          details: {
            email: user.email,
            fullName: user.full_name,
            membershipsDeactivated: user.memberships.length
          },
          created_at: new Date()
        }
      });
    }

    return {
      success: true,
      message: `User ${user.email} deactivated successfully`,
      data: {
        id: user.user_id,
        email: user.email,
        status: 'inactive'
      }
    };

  } catch (error: any) {
    console.error("Delete user error:", error);
    return {
      success: false,
      message: error.message || "Failed to delete user",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Update user status
 */
export const updateUserStatusService = async (payload: { id: string; userId: string; status: string; tenantId?: string }) => {
  try {
    const { id, userId, status, tenantId } = payload;

    if (!['active', 'pending', 'inactive', 'suspended'].includes(status)) {
      return {
        success: false,
        message: "Invalid status value",
        code: httpStatusCode.BAD_REQUEST
      };
    }

    const user = await prisma.user.findUnique({
      where: { user_id: id },
      include: {
        memberships: true
      }
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
        code: httpStatusCode.NOT_FOUND
      };
    }

    // Update membership status
    const whereCondition: any = { user_id: id };
    if (tenantId) {
      whereCondition.tenant_id = tenantId;
    }

    await prisma.membership.updateMany({
      where: whereCondition,
      data: { status }
    });

    // Create audit log
    if (userId) {
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action: 'USER_STATUS_UPDATED',
          entity_type: 'user',
          entity_id: id,
          details: {
            email: user.email,
            newStatus: status,
            tenantId: tenantId || 'all'
          },
          created_at: new Date()
        }
      });
    }

    return {
      success: true,
      message: `User status updated to ${status}`,
      data: {
        id: user.user_id,
        email: user.email,
        status
      }
    };

  } catch (error: any) {
    console.error("Update user status error:", error);
    return {
      success: false,
      message: error.message || "Failed to update user status",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};

/**
 * Get user statistics
 */
export const getUserStatsService = async () => {
  try {
    const totalUsers = await prisma.user.count();
    const superAdmins = await prisma.user.count({
      where: { is_super_admin: true }
    });
    const activeUsers = await prisma.membership.count({
      where: { status: 'active' }
    });
    const pendingUsers = await prisma.membership.count({
      where: { status: 'pending' }
    });
    const inactiveUsers = await prisma.membership.count({
      where: { status: 'inactive' }
    });

    const roleDistribution = await prisma.membership.groupBy({
      by: ['role'],
      _count: true
    });

    const recentUsers = await prisma.user.findMany({
      orderBy: {
        created_at: 'desc'
      },
      take: 10,
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    return {
      success: true,
      message: "User statistics fetched successfully",
      data: {
        totalUsers,
        superAdmins,
        activeUsers,
        pendingUsers,
        inactiveUsers,
        roleDistribution: roleDistribution.map(r => ({
          role: r.role,
          count: r._count
        })),
        recentUsers: recentUsers.map(u => ({
          id: u.user_id,
          email: u.email,
          fullName: u.full_name,
          createdAt: u.created_at,
          tenant: u.memberships[0]?.tenant?.name || 'No Tenant'
        }))
      }
    };

  } catch (error: any) {
    console.error("Get user stats error:", error);
    return {
      success: false,
      message: error.message || "Failed to fetch user statistics",
      code: httpStatusCode.INTERNAL_SERVER_ERROR
    };
  }
};

async function getTenantDetails(
  tenantId: string
): Promise<{ name: string; subdomain: string }> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { tenant_id: tenantId },
      select: {
        name: true,
        subdomain: true,
      },
    });

    return {
      name: tenant?.name || "Unknown Tenant",
      subdomain: tenant?.subdomain || "default",
    };
  } catch {
    return {
      name: "Unknown Tenant",
      subdomain: "default",
    };
  }
}