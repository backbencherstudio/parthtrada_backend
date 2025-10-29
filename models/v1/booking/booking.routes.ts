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
router.post("/", verifyUser("ANY",), create);
router.get("/", verifyUser("ANY"), index);
router.patch("/cancel/:id", verifyUser("ANY"), cancelBooking);
router.get("/past-call", verifyUser("ANY"), pastCallStudent)
router.get("/request", verifyUser("ANY"), bookingRequest)

// Expert Routes
router.get('/schedule/expert', verifyUser('ANY'), expertIndex);

export default router;
