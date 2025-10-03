import { Router } from 'express';
import {
  create,
  expertIndex,
  index,
} from "./booking.controllers";
import { verifyUser } from '@/middleware/verifyUsers';

const router = Router();

// Student Routes
router.post("/", verifyUser("STUDENT"), create);
router.get("/", verifyUser("STUDENT"), index);


// Expert Routes
router.get('/expert', verifyUser('EXPERT'), expertIndex)

export default router;
