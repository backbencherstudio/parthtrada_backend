import { Router } from "express";
import { dashboard, experts, sessions, transactions, users } from "./admin-dashboard.controllers";
import { requireRole } from "@/middleware/requireRole";

const router = Router();

router.use(requireRole(["ADMIN"]));

router.get("/analytics", dashboard);
router.get("/users", users);
router.get("/experts", experts);
router.get("/sessions", sessions);
router.get("/transactions", transactions);

export default router;
