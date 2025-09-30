import { verifyUser } from "@/middleware/verifyUsers";
import { Router } from "express";
import { create } from "./reviews.controller";

const router = Router()

router.post('/', verifyUser('STUDENT'), create)

export default router