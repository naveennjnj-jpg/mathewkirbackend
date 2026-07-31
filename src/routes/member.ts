// routes/treasurer.ts
import { Router } from "express";
import {
    getDashboardStats,
    getContributions,
    getEvents,
    submitPayment,
    getBeneficiaries,
    createBeneficiary,
    updateBeneficiary,
    deleteBeneficiary
} from "../controllers/member/member";

import { checkAuth } from "src/middleware/check-auth";
import { uploadProfile, uploadEventDocument, handleMulterError } from "src/config/multerConfig";

const router = Router();

// Apply checkAuth to all routes
router.use(checkAuth);

// Dashboard
router.get("/dashboard", getDashboardStats)
router.get("/contributions", getContributions)

// Events
router.get("/events", getEvents)

// Payment Submission
router.post("/payments/submit", submitPayment)


// Beneficiary Routes
router.get("/beneficiaries", getBeneficiaries)
router.post("/beneficiaries", createBeneficiary)
router.put("/beneficiaries/:beneficiaryId", updateBeneficiary)
router.delete("/beneficiaries/:beneficiaryId", deleteBeneficiary)

export { router }