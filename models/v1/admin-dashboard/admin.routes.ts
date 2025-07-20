import { Router } from 'express';
import { verifyAdmin } from '../../../middleware/verifyAdmin';
import { dashboard } from './admin-dashboard.controllers';
import { onlyAdmin } from '../../../middleware/onlyAdmin';

const router = Router();



router.get('/dashboard', onlyAdmin, dashboard);



export default router;
