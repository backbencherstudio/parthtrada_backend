import { Router } from "express";
import { changeStatus, dashboard, expertById, experts, me, sessions, transactions, updatePassword, updateProfile, userById, users } from "./admin-dashboard.controllers";
import { requireRole } from "@/middleware/requireRole";

const router = Router();

router.use(requireRole(["ADMIN"]));

router.get("/analytics", dashboard);
router.get("/users", users);
router.get("/users/me", me);
router.get("/users/:id", userById);
router.get("/experts", experts);
router.get("/sessions", sessions);
router.get("/transactions", transactions);
router.patch("/profile/update", updateProfile);
router.patch("/profile/update/password", updatePassword);
router.get("/experts/:id", expertById);
router.patch("/experts/:id/status", changeStatus);

export default router;
