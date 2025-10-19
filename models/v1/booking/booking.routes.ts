import { Router } from 'express';
import {
  bookingRequest,
  cancelBooking,
  create,
  expertIndex,
  index,
  pastCallStudent,
} from "./booking.controllers";
import { verifyUser } from '@/middleware/verifyUsers';

const router = Router();

// Student Routes
router.post("/", verifyUser("ANY"), create);
router.get("/", verifyUser("STUDENT"), index);
router.patch("/cancel/:id", verifyUser("STUDENT"), cancelBooking);
router.get("/past-call", verifyUser("STUDENT"), pastCallStudent)
router.get("/request", verifyUser("STUDENT"), bookingRequest)

// Expert Routes
router.get('/schedule/expert', verifyUser('EXPERT'), expertIndex);

export default router;
