// routes/admin/tenant.ts
import { Router } from "express"
import { checkAuth } from "src/middleware/check-auth"
import {
    getAllTenants,
    getTenantById,
    createTenant,
    updateTenant,
    updateTenantStatus,
    deleteTenant,
    getTenantStats,
    checkSubdomainAvailability,
    getDashboardStats,
    
} from "../controllers/admin/tenant/tenant";
import { getAuditLogs } from "../controllers/admin/tenant/audit/auditLog";
import {
  getAllTransactions
} from "../controllers/admin/tenant/reconciliation/reconciliation";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  getUserStats
} from "../controllers/admin/tenant/user/user";

const router = Router()

// All routes require authentication
router.use(checkAuth)

router.get("/dashboard", getDashboardStats);

// Tenant management routes
router.get("/tenants", getAllTenants)
router.get("/tenants/:id", getTenantById)
router.get("/tenants/:id/stats", getTenantStats)
router.get("/check-subdomain", checkSubdomainAvailability)
router.get("/audit-logs", getAuditLogs);
router.post("/tenants", createTenant)
router.put("/tenants/:id", updateTenant)
router.patch("/tenants/:id/status", updateTenantStatus)
router.delete("/tenants/:id", deleteTenant)
router.get("/alltransaction", getAllTransactions);
router.get("/stats", getUserStats);

// GET /api/admin/users/allusers - Get all users
router.get("/allusers", getAllUsers);

// POST /api/admin/users/createuser - Create new user
router.post("/createuser", createUser);

// PARAMETER ROUTES LAST
// GET /api/admin/users/getuser/:id - Get user by ID
router.get("/getuser/:id", getUserById);

// PUT /api/admin/users/updateuser/:id - Update user
router.put("/updateuser/:id", updateUser);

// PATCH /api/admin/users/updateuserstatus/:id/status - Update user status
router.patch("/updateuserstatus/:id/status", updateUserStatus);

// DELETE /api/admin/users/deleteuser/:id - Delete user
router.delete("/deleteuser/:id", deleteUser);


export { router }