import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { createBooking, confirmPayment } from "./booking.controllers";

const router = Router();

router.post("/create", verifyUser("STUDENT"), createBooking);
router.post("/confirm-payment", confirmPayment);

export default router;