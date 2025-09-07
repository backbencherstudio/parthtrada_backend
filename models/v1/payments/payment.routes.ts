import express, { Request, Response, Router } from 'express';
import { balance, confirmPayment, payouts, refundTransaction, savePaymentMethod } from './payment.controller';
import { verifyUser } from '@/middleware/verifyUsers';
import { checkOnboardingStatus, createStripeAccount, getOnboardingLink, webhook } from './stripe.controllers';

const router = Router()

router.post('/save-payment-method', savePaymentMethod)
router.post("/confirm-payment", verifyUser("ANY"), confirmPayment);

// expert routes
router.post("/experts/refund", verifyUser("EXPERT"), refundTransaction);
router.get("/experts/balance", verifyUser("EXPERT"), balance);
router.post("/experts/payouts", verifyUser("EXPERT"), payouts);

// Stripe Connect routes
router.post("/stripe/create-account", verifyUser("ANY"), createStripeAccount);
router.get("/stripe/onboarding-link", verifyUser("ANY"), getOnboardingLink);
router.get("/stripe/status", verifyUser("ANY"), checkOnboardingStatus);

// Stripe Webhook
router.post('/webhook', express.raw({ type: 'application/json' }), webhook)

export default router
