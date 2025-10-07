import { Router } from 'express';
import { verifyUser } from '@/middleware/verifyUsers';
import { getStudentByID } from './students.controller';

const router = Router();

router.get('/:id', getStudentByID)

export default router;
