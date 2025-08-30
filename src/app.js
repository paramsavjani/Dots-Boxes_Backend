import cookieParser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { redisClient } from "./index.js";

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
  const sessionId = socket.handshake.query.sessionId;
  if (!sessionId) {
    return next(new Error("Session ID is required"));
  }
  socket.sessionId = sessionId;
  next();
});

io.on("connection", (socket) => {
  
  socket.on("join", async (username) => {
    const user = { socketId: socket.id, username, sessionId: socket.sessionId };
    console.log("New client connected:", username);
    console.log(await redisClient.hGetAll("onlineUsers"));
    
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
