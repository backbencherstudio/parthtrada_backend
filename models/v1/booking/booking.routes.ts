import { Router } from 'express';
import {
  cancelBooking,
  create,
  expertIndex,
  index,
} from "./booking.controllers";
import { verifyUser } from '@/middleware/verifyUsers';

const router = Router();

// Student Routes
router.post("/", verifyUser("STUDENT"), create);
router.get("/", verifyUser("STUDENT"), index);
router.patch("/cancel/:id", verifyUser("STUDENT"), cancelBooking);

// Expert Routes
router.get('/schedule/expert', verifyUser('EXPERT'), expertIndex)

export default router;
