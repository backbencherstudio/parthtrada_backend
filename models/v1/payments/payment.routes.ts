import {  Router } from 'express';
import { savePaymentMethod } from './payment.controller';

const router = Router()

router.post('/save-payment-method', savePaymentMethod)

export default router
