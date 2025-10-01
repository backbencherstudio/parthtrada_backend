// socket-server.ts
import { Server } from "socket.io";
import { createServer } from "http";
import app from "./app";

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

  socket.on("new-message", (message) => {
    io.to(message.conversationId).emit("new-message", message);
  });
});

export { httpServer, io };
