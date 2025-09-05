import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { 
  createBooking,
} from "./booking.controllers";

const router = Router();

// Booking routes
router.post("/create", verifyUser("STUDENT"), createBooking);

export default router;