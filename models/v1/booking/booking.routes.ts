import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { 
  createBooking, 
  confirmPayment,
  capturePayment,
  initiateRefund
} from "./booking.controllers";
import {
  createStripeAccount,
  getOnboardingLink,
  checkOnboardingStatus
} from "./stripe.controllers";

const router = Router();

// Booking routes
router.post("/create", verifyUser("STUDENT"), createBooking);
router.post("/confirm-payment", verifyUser("ANY"), confirmPayment);
router.post("/capture-payment", verifyUser("EXPERT"), capturePayment);
router.post("/refund", verifyUser("ANY"), initiateRefund);

// Stripe Connect routes
router.post("/stripe/create-account", verifyUser("EXPERT"), createStripeAccount);
router.get("/stripe/onboarding-link", verifyUser("EXPERT"), getOnboardingLink);
router.get("/stripe/status", verifyUser("EXPERT"), checkOnboardingStatus);

export default router;