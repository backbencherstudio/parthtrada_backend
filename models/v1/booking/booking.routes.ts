import { Router } from 'express';
// import { } from './booking.controllers';
import { verifyUser } from '../../../middleware/verifyUsers';
import upload from "../../../config/multer.config";
import { getAvailableExperts, createBooking, confirmPayment, getMyBookings, cancelBooking } from "./booking.controllers"

const router = Router();

// Get available experts with optional filters
router.get("/experts/available", getAvailableExperts)

// Create a new booking (students only)
router.post("/create", verifyUser("STUDENT"), createBooking)

// Confirm payment after Stripe payment success
router.post("/confirm-payment", confirmPayment)

// Get user's bookings (both students and experts)
router.get("/my-bookings", verifyUser("ANY"), getMyBookings)

// Cancel booking
router.put("/cancel/:bookingId", verifyUser("ANY"), cancelBooking)



export default router;