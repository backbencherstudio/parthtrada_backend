import { verifyUser } from "@/middleware/verifyUsers";
import { Router } from "express";
import { create } from "./reviews.controller";

const router = Router()

router.post('/', verifyUser('EXPERT'), create)

export default router
