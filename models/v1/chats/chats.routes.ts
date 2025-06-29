import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import { checkChatAccess, getChatRoom, getChatMessages } from './chats.controllers';

const router = Router();

router.get('/access/:expertId', verifyUser('ANY'), checkChatAccess);
router.get('/room/:expertId', verifyUser("ANY"), getChatRoom);
router.get('/messages/:roomId', verifyUser("ANY"), getChatMessages);

export default router;