import Joi from "joi";

export const reconciliationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  tenantId: Joi.string().uuid().allow('all').default('all'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')),
  type: Joi.string().valid('collection', 'payout', 'all').default('all'),
  status: Joi.string().valid('completed', 'pending', 'failed', 'all').default('all'),
  search: Joi.string().allow('').default(''),
  sortBy: Joi.string().valid('date', 'amount', 'status', 'reference', 'tenantName').default('date'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const transactionDetailSchema = Joi.object({
  type: Joi.string().valid('collection', 'payout').required()
});