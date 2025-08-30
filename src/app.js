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

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("join", async (username) => {
    const user = { id: socket.id, username };

    await redisClient.hSet("onlineUsers", socket.id, JSON.stringify(user));

    console.log(`${username} joined!`);

    io.emit("userJoined", user);
  });

  socket.on("disconnect", async () => {
    const userStr = await redisClient.hGet("onlineUsers", socket.id);

    if (userStr) {
      const user = JSON.parse(userStr);

      await redisClient.hDel("onlineUsers", socket.id);

      console.log(`${user.username} left!`);

      io.emit("userLeft", user);
    }
  });
});

export { httpServer };