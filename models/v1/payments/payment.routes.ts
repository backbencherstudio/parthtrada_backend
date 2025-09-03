import {  Router } from 'express';
import { savePaymentMethod } from './payment.controller';
import { verifyUser } from '@/middleware/verifyUsers';

const router = Router()

router.post('/save-payment-method', savePaymentMethod)

export default router
