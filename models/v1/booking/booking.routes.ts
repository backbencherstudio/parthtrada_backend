import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { 
  createBooking, 
  confirmPayment,
  capturePayment,
  initiateRefund,
  createTransaction,
  withdrawTransaction,
  refundTransaction
} from "./booking.controllers";
import {
  createStripeAccount,
  getOnboardingLink,
  checkOnboardingStatus
} from "./stripe.controllers";

const router = Router();


// Route for creating a payment transaction
router.post('/create-payment', verifyUser("EXPERT"), (req, res, next) => {
  createTransaction(req, res)
    .then(result => {
      // If the controller returns a response, do nothing (it already sent the response)
      // Otherwise, end the response
      if (!res.headersSent) res.end();
    })
    .catch(next);
});

// Route for withdrawing funds (expert)
router.post('/withdraw', verifyUser("EXPERT"), (req, res, next) => {
  withdrawTransaction(req, res)
    .then(result => {
      if (!res.headersSent) res.end();
    })
    .catch(next);
});

// Route for refunding a transaction
router.post('/refund', verifyUser("EXPERT"), (req, res, next) => {
  refundTransaction(req, res)
    .then(result => {
      if (!res.headersSent) res.end();
    })
    .catch(next);
});

// Booking routes
router.post("/create", verifyUser("STUDENT"), createBooking);
router.post("/confirm-payment", verifyUser("ANY"), confirmPayment);
router.post("/capture-payment", verifyUser("EXPERT"), capturePayment);
router.post("/refund", verifyUser("ANY"), initiateRefund);



// Stripe Connect routes
router.post("/stripe/create-account", verifyUser("ANY"), createStripeAccount);
router.get("/stripe/onboarding-link", verifyUser("ANY"), getOnboardingLink);
router.get("/stripe/status", verifyUser("ANY"), checkOnboardingStatus);

export default router;