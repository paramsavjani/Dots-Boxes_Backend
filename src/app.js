import cookieParser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { redisClient } from "./index.js";
import { v4 as uuidv4 } from "uuid";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));

app.use(cookieParser());

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("hello world");
});

import User from "./routes/user.route.js";

app.use("/api/user", User);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
});

io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId;
  if (!sessionId) {
    return next(new Error("Session ID is required"));
  }
  socket.sessionId = sessionId;
  next();
});

io.on("connection", (socket) => {
  socket.on("join", async (username) => {
    const user = { socketId: socket.id, username, sessionId: socket.sessionId };
    console.log("New client connected:", socket.sessionId);

    await redisClient.hSet(
      "onlineUsers",
      socket.sessionId,
      JSON.stringify(user)
    );

    io.emit(
      "onlineUsers",
      Object.values(await redisClient.hGetAll("onlineUsers")).map((userStr) =>
        JSON.parse(userStr)
      )
    );
  });

  socket.on("sendFriendRequest", async (toSessionId) => {
    const senderData = await redisClient.hGet("onlineUsers", socket.sessionId);
    const sender = JSON.parse(senderData);
    const receiverData = await redisClient.hGet("onlineUsers", toSessionId);
    const receiver = JSON.parse(receiverData);
    if (!receiver) {
      return;
    }

    const sentKey = `friendRequests:sent:${sender.sessionId}`;
    const receivedKey = `friendRequests:received:${toSessionId}`;

    const requestData = JSON.stringify({
      from: sender.sessionId,
      to: toSessionId,
    });

    await redisClient.sAdd(sentKey, requestData);
    await redisClient.sAdd(receivedKey, requestData);
    await redisClient.expire(sentKey, 5 * 60);
    await redisClient.expire(receivedKey, 5 * 60);

    console.log(
      `Friend request sent from ${sender.username} to ${toSessionId}`
    );

    const req = { from: sender.sessionId, to: "me" };

    io.to(receiver.socketId).emit("receiveFriendRequest", req);
  });

  socket.on("friendRequestAccepted", async (toSessionId) => {
    const receiverData = await redisClient.hGet("onlineUsers", toSessionId);
    const receiver = JSON.parse(receiverData);
    const senderData = await redisClient.hGet("onlineUsers", socket.sessionId);
    const sender = JSON.parse(senderData);
    if (!receiver || !sender) {
      return;
    }

    const sentKey = `friendRequests:sent:${socket.sessionId}`;
    const sentKey2 = `friendRequests:sent:${toSessionId}`;
    const receivedKey = `friendRequests:received:${toSessionId}`;
    const receivedKey2 = `friendRequests:received:${socket.sessionId}`;

    await redisClient.del(sentKey);
    await redisClient.del(receivedKey);
    await redisClient.del(sentKey2);
    await redisClient.del(receivedKey2);

    const roomId = uuidv4();

    await redisClient.set(`user:${sender.sessionId}`, roomId);
    await redisClient.expire(`user:${sender.sessionId}`, 60 * 30);
    await redisClient.set(`user:${receiver.sessionId}`, roomId);
    await redisClient.expire(`user:${receiver.sessionId}`, 60 * 30);
    await redisClient.hSet(`room:${roomId}`, {
      players: JSON.stringify([sender.sessionId, receiver.sessionId]),
      status: "running",
    });
    await redisClient.expire(`room:${roomId}`, 60 * 30);

    socket.join(roomId);
    io.sockets.sockets.get(receiver.socketId)?.join(roomId);

    io.to(roomId).emit("gameStart", { roomId });
  });

  socket.on("disconnect", async () => {
    const userStr = await redisClient.hGet("onlineUsers", socket.sessionId);

    if (userStr) {
      const user = JSON.parse(userStr);

      await redisClient.hDel("onlineUsers", socket.sessionId);

      console.log(`${user.username} left!`);

      io.emit(
        "onlineUsers",
        Object.values(await redisClient.hGetAll("onlineUsers")).map((userStr) =>
          JSON.parse(userStr)
        )
      );
    }
  });
});

export { httpServer };
