import { Router } from 'express';
import { linkedinCallback, updateUser, beExpert, beStudent, fordev, fordevSignup, adminLogin, verifyOTP, resendOTP, register, forgotPassword, verifyResetToken, resetPassword } from './auth.controllers';
import { verifyUser } from '@/middleware/verifyUsers';
import upload from '@/config/multer.config';

const router = Router();

router.get('/linkedin/callback', linkedinCallback);

router.post('/for-dev-login', fordev)
router.post('/for-dev-signup', fordevSignup);

router.put('/update', verifyUser('ANY'), upload.single("image"), updateUser);

router.put('/be-expert', verifyUser('STUDENT'), beExpert)
router.put('/be-student', verifyUser('EXPERT'), beStudent);

router.post('/login', adminLogin);
router.post('/register', register);
router.post('/verify-login', verifyOTP);
router.post('/admin-login-otp-resend', resendOTP);
router.post('/forgot-password', forgotPassword)
router.post('/verify-reset-token', verifyResetToken)
router.post('/reset-password', resetPassword)

export default router;
