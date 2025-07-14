import { Router } from 'express';
import { verifyUser } from '../../../middleware/verifyUsers';
import {
  checkChatAccess,
  getChatRoom,
  getChatMessages,
  getChatList,
  deleteMessage,
  editMessage,
  markMessagesAsRead,
  markMessageAsRead
} from './chats.controllers';

const router = Router();

// Chat access and rooms
router.get('/access/:otherUserId', verifyUser('ANY'), checkChatAccess);
router.get('/room/:otherUserId', verifyUser('ANY'), getChatRoom);
router.get('/list', verifyUser('ANY'), getChatList);

// Message operations
router.get('/messages/:roomId', verifyUser('ANY'), getChatMessages);
router.put('/messages/read/:roomId', verifyUser('ANY'), markMessagesAsRead);
router.delete('/message/:messageId', verifyUser('ANY'), deleteMessage);
router.patch('/message/:messageId', verifyUser('ANY'), editMessage);
// Add this route with your other chat routes
router.patch('/messages/:messageId/read', verifyUser('ANY'), markMessageAsRead);

export default router;