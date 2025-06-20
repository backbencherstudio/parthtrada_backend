import { Router } from 'express';
import { linkedinCallback, updateUser, beExpart, beStudent } from './auth.controllers';
import { verifyUser } from '../../../middleware/verifyUsers';
import upload from "../../../config/multer.config";

const router = Router();


router.get('/linkedin/callback', linkedinCallback);

router.put('/update', verifyUser('ANY'), upload.single("image"),  updateUser);

router.put('/be-expart', verifyUser('STUDENT'), beExpart)
router.put('/be-student', verifyUser('EXPERT'), beStudent);


export default router;
