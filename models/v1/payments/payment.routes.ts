import express, { Request, Response, Router } from 'express';
import { addCard, balance, confirmPayment, createSetupIntent, getCards, payouts, refundTransaction } from './payment.controller';
import { verifyUser } from '@/middleware/verifyUsers';
import { checkOnboardingStatus, createStripeAccount, getOnboardingLink, updateOnboardStatus, webhook } from './stripe.controllers';

const router = Router()

router.post('/create-setup-intent', createSetupIntent)
router.post('/cards', addCard)
router.get('/cards', verifyUser('ANY'), getCards)
router.post("/confirm-payment", verifyUser("ANY"), confirmPayment);

// for dev
router.get('/add-card', async (req: Request, res: Response) => {
  res.render("index");
})

// expert routes
router.post("/experts/refund", verifyUser("EXPERT"), refundTransaction);
router.get("/experts/balance", verifyUser("EXPERT"), balance);
router.post("/experts/payouts", verifyUser("EXPERT"), payouts);

// Stripe Connect routes
router.post("/stripe/create-account", verifyUser("EXPERT"), createStripeAccount);
router.get("/stripe/onboarding-link", verifyUser("ANY"), getOnboardingLink);
router.get("/stripe/status", verifyUser("ANY"), checkOnboardingStatus);
router.get('/stripe/account/success/:id', updateOnboardStatus)

// Stripe Webhook
router.post('/webhook', express.raw({ type: 'application/json' }), webhook)

export default router
