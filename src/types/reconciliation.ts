// types/admin/reconciliation.ts

export interface ReconciliationQueryParams {
  page?: number;
  limit?: number;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  type?: 'collection' | 'payout' | 'all';
  status?: 'completed' | 'pending' | 'failed' | 'all';
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ReconciliationSummary {
  totalCollected: number;
  totalPending: number;
  totalPayouts: number;
  collectionRate: number;
  totalTenants: number;
  activeTenants: number;
  totalContributions: number;
  totalPayoutCount: number;
}

export interface ReconciliationTransaction {
  id: string;
  tenantId: string;
  tenantName: string;
  date: Date;
  amount: number;
  type: 'collection' | 'payout';
  status: 'completed' | 'pending' | 'failed';
  reference: string;
  description?: string;
  paymentMethod?: string;
  verifiedBy?: string;
  verifierName?: string;
  createdAt: Date;
}

export interface ReconciliationFilters {
  tenants: { id: string; name: string }[];
  statuses: string[];
  types: string[];
}