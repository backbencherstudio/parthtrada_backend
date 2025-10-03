// socket-server.ts
import { Server } from "socket.io";
import { createServer } from "http";
import app from "./app";
import createMessage from "./services/sendMessage";

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [],
    methods: ["GET", "POST"],
    credentials: true
  },
});

const onlineUsers = new Map<string, string>();

io.on("connection", (socket) => {
  socket.on("join", (userId: string) => {
    onlineUsers.set(userId, socket.id);
    socket.join(userId)
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });

  socket.on("disconnect", () => {
    for (const [userId, id] of onlineUsers.entries()) {
      if (id === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });

  socket.on("typing", ({ conversationId, userId }) => {
    socket.to(conversationId).emit("typing", { userId });
  });

  socket.on("stop-typing", ({ conversationId, userId }) => {
    socket.to(conversationId).emit("stop-typing", { userId });
  });

  socket.on("join-conversation", (conversationId: string) => {
    socket.join(conversationId);
  });

  socket.on("send-message", async (message) => {
    console.log('============new message========================');
    console.log(message);
    console.log('====================================');
    await createMessage({ content: message.content, recipientId: message.recipientId, user_id: message.user_id })
    io.to(message.recipientId).emit("new-message", message);
  });
});

export { httpServer, io };
