import { Router } from 'express';
import { linkedinCallback, updateUser, beExpert, beStudent, fordev, fordevSignup, adminLogin, verifyOTP, resendOTP } from './auth.controllers';
import { verifyUser } from '@/middleware/verifyUsers';
import upload from '@/config/multer.config';
import { verifyAdmin } from '@/middleware/verifyAdmin';

const router = Router();


router.get('/linkedin/callback', linkedinCallback);

router.post('/for-dev-login', fordev)
router.post('/for-dev-signup', fordevSignup); 

router.put('/update', verifyUser('ANY'), upload.single("image"),  updateUser);

router.put('/be-expert', verifyUser('STUDENT'), beExpert)
router.put('/be-student', verifyUser('EXPERT'), beStudent);

router.post('/admin-login', verifyAdmin, adminLogin);
router.post('/admin-login-otp', verifyAdmin, verifyOTP);
router.post('/admin-login-otp-resend', verifyAdmin, resendOTP);


export default router;
