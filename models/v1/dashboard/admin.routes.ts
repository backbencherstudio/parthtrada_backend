import { Router } from "express";
import { changeStatus, dashboard, expertById, experts, sessions, transactions, updateProfile, users } from "./admin-dashboard.controllers";
import { requireRole } from "@/middleware/requireRole";

const router = Router();

router.use(requireRole(["ADMIN"]));

router.get("/analytics", dashboard);
router.get("/users", users);
router.get("/experts", experts);
router.get("/sessions", sessions);
router.get("/transactions", transactions);
router.patch("/profile/update", updateProfile);
router.get("/experts/:id", expertById);
router.patch("/experts/:id/status", changeStatus);

export default router;
