import { Router } from "express";
import { index } from "./notifications.controller";
import { verifyUser } from "@/middleware/verifyUsers";

const router = Router();

router.get('/', verifyUser('ANY'), index)

export default router;
