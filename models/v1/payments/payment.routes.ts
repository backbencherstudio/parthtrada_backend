import {  Router } from 'express';
import { confirmPayment, refundTransaction, savePaymentMethod, withdrawTransaction } from './payment.controller';
import { verifyUser } from '@/middleware/verifyUsers';
import { checkOnboardingStatus, createStripeAccount, getOnboardingLink } from './stripe.controllers';

const router = Router()

router.post('/save-payment-method', savePaymentMethod)
router.post("/confirm-payment", verifyUser("ANY"), confirmPayment);
router.post("/refund", verifyUser("EXPERT"), refundTransaction);
router.post("/withdraw", verifyUser("EXPERT"), withdrawTransaction);

// Stripe Connect routes
router.post("/stripe/create-account", verifyUser("ANY"), createStripeAccount);
router.get("/stripe/onboarding-link", verifyUser("ANY"), getOnboardingLink);
router.get("/stripe/status", verifyUser("ANY"), checkOnboardingStatus);

export default router
