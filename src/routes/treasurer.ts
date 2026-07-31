// routes/treasurer.ts
import { Router } from "express";
import {
    getDashboardStats,
    getMembers,
    addMember,
    updateMember,
    deleteMember,
    importMembers,
    getAllPayments,
    updatePaymentStatus,
    getPayouts,
    createPayout,
    updatePayout,
    deletePayout,
    generateReport,
    exportReport,
    getAnalyticsStat
} from "../controllers/treasurer/treasurer";

import {
    createEvent,
    getEvents,
    getEventById,
    updateEvent,
    deleteEvent,
    getEventSummary
} from "../controllers/treasurer/events"

import { checkAuth } from "src/middleware/check-auth";
import { uploadProfile, uploadEventDocument, handleMulterError } from "src/config/multerConfig";

const router = Router();

// Apply checkAuth to all routes
router.use(checkAuth);

// Dashboard
router.get("/dashboard", getDashboardStats)


router.get("/analytics", getAnalyticsStat)

// Members Management
router.get("/members", getMembers)
router.post("/members", addMember)
router.put("/members/:id", updateMember)
router.delete("/members/:id", deleteMember)
router.post("/members/import", importMembers)

// Events Management with file upload
router.get("/events", getEvents)
router.get("/events/summary", getEventSummary)
router.get("/events/:id", getEventById)
router.post("/events", uploadEventDocument.single("document"), handleMulterError, createEvent)
// FIX: PUT was missing the multer middleware. EditEvent.tsx submits
// multipart/form-data (it includes a file input), so without this,
// req.body arrives empty/unparsed on every update — this was the root
// cause of members/beneficiary edits silently not saving.
router.put("/events/:id", uploadEventDocument.single("document"), handleMulterError, updateEvent)
router.delete("/events/:id", deleteEvent)


// Payment Verification - Treasurer Routes
router.get("/payments", getAllPayments)  // Get all payments
router.patch("/payments/:paymentId/status", updatePaymentStatus)  // Update payment status

// Payout Routes
router.get("/payouts", getPayouts)
router.post("/payouts", createPayout)
router.put("/payouts/:payoutId", updatePayout)
router.delete("/payouts/:payoutId", deletePayout)

// Report Routes
router.get("/reports/:reportType", generateReport)
router.post("/reports/export", exportReport)

export { router }