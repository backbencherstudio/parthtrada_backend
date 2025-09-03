import { Router } from 'express';
import { linkedinCallback, updateUser, beExpart, beStudent, fordev, fordevSignup, adminLogin, verifyOTP, resendOTP } from './auth.controllers';
import { verifyUser } from '@/middleware/verifyUsers';
import upload from '@/config/multer.config';
import { verifyAdmin } from '@/middleware/verifyAdmin';

const router = Router();


router.get('/linkedin/callback', linkedinCallback);

router.post('/fotdev-login', fordev)
router.post('/fordev-signup', fordevSignup); 

router.put('/update', verifyUser('ANY'), upload.single("image"),  updateUser);

router.put('/be-expart', verifyUser('STUDENT'), beExpart)
router.put('/be-student', verifyUser('EXPERT'), beStudent);

router.post('/admin-login', verifyAdmin, adminLogin);
router.post('/admin-login-otp', verifyAdmin, verifyOTP);
router.post('/admin-login-otp-resend', verifyAdmin, resendOTP);


export default router;
