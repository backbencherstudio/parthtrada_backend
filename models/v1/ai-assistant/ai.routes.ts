import { Router } from 'express';
import { handleStudentQuery } from './ai.controller';

const router = Router();

router.post("/query", handleStudentQuery);

export default router;
