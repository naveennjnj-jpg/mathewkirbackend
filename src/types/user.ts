// types/admin/user.ts
export interface UserQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  tenantId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  role: string;
  tenantId?: string;
  password?: string;
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  status?: string;
  password?: string;
}

export interface User {
  user_id: string;
  email: string;
  full_name: string;
  phone?: string;
  is_super_admin: boolean;
  created_at: Date;
  memberships: UserMembership[];
}

export interface UserMembership {
  membership_id: string;
  tenant_id: string;
  role: string;
  status: string;
  joined_at: Date;
  tenant: {
    tenant_id: string;
    name: string;
    subdomain: string;
  };
}