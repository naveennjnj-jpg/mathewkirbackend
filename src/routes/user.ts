import { Router } from "express";
import { login, userdata, forgotPassword, getDashboardStats, profileupdate,
    updateAPassword, getPlatformSetting, updatePlatformSetting, getTenantDomainData } from "../controllers/user/user";
import { checkAuth } from "src/middleware/check-auth";
import { uploadProfile, uploadEventDocument } from "src/config/multerConfig";

const router = Router();

router.get("/me", checkAuth, userdata);
router.post("/login", login)
router.patch("/forgot-password", forgotPassword)
router.get("/dashboard", checkAuth, getDashboardStats)
router.post("/update-profile-pic", uploadProfile.single("profileImage"), profileupdate);
router.route("/change-password").post(checkAuth, updateAPassword)
router.get("/tenants/:subdomain", getTenantDomainData);
router.route("/settings/platform").get(checkAuth, getPlatformSetting).put(checkAuth, updatePlatformSetting)

router.post("/upload-proof", uploadEventDocument.single("profileImage"), profileupdate);


export { router }