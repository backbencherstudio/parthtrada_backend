import { Router } from 'express';
import { verifyAdmin } from '../../../middleware/verifyAdmin';
import { dashboard, dashboardExpertsList, dashboardSessionsList, dashboardTransactionsList, dashboardUsersList } from './admin-dashboard.controllers';
import { onlyAdmin } from '../../../middleware/onlyAdmin';

const router = Router();

router.get('/dashboard', onlyAdmin, dashboard);
router.get('/dashboardUsersList', onlyAdmin, dashboardUsersList);
router.get('/dashboardExpertsList', onlyAdmin, dashboardExpertsList);
router.get('/dashboardSessionsList', onlyAdmin, dashboardSessionsList);
router.get('/dashboardTransactionsList', onlyAdmin, dashboardTransactionsList);

export default router;
