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


const checkCompletedSquares = (connections) => {
  const completed = [];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const topLeft = { row, col };
      const topRight = { row, col: col + 1 };
      const bottomLeft = { row: row + 1, col };
      const bottomRight = { row: row + 1, col: col + 1 };

      const hasTop = connections.some(
        (conn) =>
          (conn.from.row === topLeft.row &&
            conn.from.col === topLeft.col &&
            conn.to.row === topRight.row &&
            conn.to.col === topRight.col) ||
          (conn.from.row === topRight.row &&
            conn.from.col === topRight.col &&
            conn.to.row === topLeft.row &&
            conn.to.col === topLeft.col)
      );

      const hasBottom = connections.some(
        (conn) =>
          (conn.from.row === bottomLeft.row &&
            conn.from.col === bottomLeft.col &&
            conn.to.row === bottomRight.row &&
            conn.to.col === bottomRight.col) ||
          (conn.from.row === bottomRight.row &&
            conn.from.col === bottomRight.col &&
            conn.to.row === bottomLeft.row &&
            conn.to.col === bottomLeft.col)
      );

      const hasLeft = connections.some(
        (conn) =>
          (conn.from.row === topLeft.row &&
            conn.from.col === topLeft.col &&
            conn.to.row === bottomLeft.row &&
            conn.to.col === bottomLeft.col) ||
          (conn.from.row === bottomLeft.row &&
            conn.from.col === bottomLeft.col &&
            conn.to.row === topLeft.row &&
            conn.to.col === topLeft.col)
      );

      const hasRight = connections.some(
        (conn) =>
          (conn.from.row === topRight.row &&
            conn.from.col === topRight.col &&
            conn.to.row === bottomRight.row &&
            conn.to.col === bottomRight.col) ||
          (conn.from.row === bottomRight.row &&
            conn.from.col === bottomRight.col &&
            conn.to.row === topRight.row &&
            conn.to.col === topRight.col)
      );

      if (hasTop && hasBottom && hasLeft && hasRight) {
        completed.push({ topLeft, completedAt: Date.now() });
      }
    }
  }

  return completed;
};

const connectionExists = (connections, from, to) => {
  return connections.some(
    (conn) =>
      (conn.from.row === from.row &&
        conn.from.col === from.col &&
        conn.to.row === to.row &&
        conn.to.col === to.col) ||
      (conn.from.row === to.row &&
        conn.from.col === to.col &&
        conn.to.row === from.row &&
        conn.to.col === from.col)
  );
};

const areAdjacent = (pos1, pos2) => {
  const rowDiff = Math.abs(pos1.row - pos2.row);
  const colDiff = Math.abs(pos1.col - pos2.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
};

const initializeGameState = async (
  roomId,
  player1SessionId,
  player2SessionId
) => {
  const user1 = JSON.parse(await redisClient.get(`user:${player1SessionId}`));
  const user2 = JSON.parse(await redisClient.get(`user:${player2SessionId}`));

  return {
    roomId,
    connections: [],
    completedSquares: [],
    currentPlayer: "player1",
    scores: {
      player1: 0,
      player2: 0,
    },
    gameStatus: "playing",
    players: {
      player1: {
        id: player1SessionId,
        name: user1.username,
        connected: true,
      },
      player2: {
        id: player2SessionId,
        name: user2.username,
        connected: true,
      },
    },
    createdAt: Date.now(),
    lastMove: Date.now(),
  };
};

io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId;
  if (!sessionId || sessionId === "") {
    return next(new Error("Session ID is required"));
  }
  socket.sessionId = sessionId;
  next();
});

io.on("connection", async (socket) => {
  const user = await redisClient.get(`user:${socket.sessionId}`);
  let userData = JSON.parse(user);
  if (userData) {
    userData.socketId = socket.id;
    await redisClient.set(`user:${socket.sessionId}`, JSON.stringify(userData), {
      EX: 30 * 60,
    });
  }

  socket.on("join", async (username) => {
    const user = { socketId: socket.id, username, sessionId: socket.sessionId };
    console.log("New client connected:", user.username);

    await redisClient.set(`user:${socket.sessionId}`, JSON.stringify(user), {
      EX: 30 * 60,
    });

    await redisClient.set(
      `onlineUser:${socket.sessionId}`,
      JSON.stringify(user),
      { EX: 30 * 60 }
    );

    const keys = await redisClient.keys("onlineUser:*");
    const users = await Promise.all(keys.map((k) => redisClient.get(k)));

    io.emit(
      "onlineUsers",
      Object.values(users).map((userStr) => JSON.parse(userStr))
    );
  });

  socket.on("sendFriendRequest", async (toSessionId) => {
    const senderData = await redisClient.get(`user:${socket.sessionId}`);
    const sender = JSON.parse(senderData);
    const receiverData = await redisClient.get(`user:${toSessionId}`);
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
      `Friend request sent from ${sender.username} to ${receiver.username}`
    );

    const req = { from: sender.sessionId, to: "me" };

    io.to(receiver.socketId).emit("receiveFriendRequest", req);
  });

  socket.on("friendRequestAccepted", async (toSessionId) => {
    const receiverData = await redisClient.get(`user:${toSessionId}`);
    const receiver = JSON.parse(receiverData);
    const senderData = await redisClient.get(`user:${socket.sessionId}`);
    const sender = JSON.parse(senderData);
    if (!receiver || !sender) {
      return;
    }

    const sentKey = `friendRequests:sent:${socket.sessionId}`;
    const sentKey2 = `friendRequests:sent:${toSessionId}`;
    const receivedKey = `friendRequests:received:${toSessionId}`;
    const receivedKey2 = `friendRequests:received:${socket.sessionId}`;

    await redisClient.del(`onlineUser:${toSessionId}`);
    const keys = await redisClient.keys("onlineUser:*");
    const users = await Promise.all(keys.map((k) => redisClient.get(k)));

    io.emit(
      "onlineUsers",
      Object.values(users).map((userStr) => JSON.parse(userStr))
    );

    await redisClient.del(sentKey);
    await redisClient.del(receivedKey);
    await redisClient.del(sentKey2);
    await redisClient.del(receivedKey2);

    const roomId = uuidv4();

    await redisClient.set(`activeUser:${sender.sessionId}`, roomId, {
      EX: 60 * 60,
    });
    await redisClient.set(`activeUser:${receiver.sessionId}`, roomId, {
      EX: 60 * 60,
    });

    
    const gameState = await initializeGameState(
      roomId,
      sender.sessionId,
      receiver.sessionId
    );
    await redisClient.set(`gameState:${roomId}`, JSON.stringify(gameState), {
      EX: 60 * 60,
    });

    await redisClient.hSet(`room:${roomId}`, {
      players: JSON.stringify([sender.sessionId, receiver.sessionId]),
      status: "running",
    });

    socket.join(roomId);
    io.sockets.sockets.get(receiver.socketId)?.join(roomId);

    io.to(roomId).emit("gameStart", gameState);
  });

  socket.on("checkActiveRoom", async () => {
    if (socket.sessionId) {
      const roomId = await redisClient.get(`activeUser:${socket.sessionId}`);
      if (!roomId) {
        io.to(socket.id).emit("activeRoom", null);
        return;
      }
      const user = await redisClient.get(`user:${socket.sessionId}`);
      const userData = JSON.parse(user);
      if (roomId && userData) {
        socket.join(roomId);
        console.log("active room found:", roomId);

        
        const gameStateStr = await redisClient.get(`gameState:${roomId}`);
        if (gameStateStr) {
          const gameState = JSON.parse(gameStateStr);

          
          const playerRole =
            gameState.players.player1.id === socket.sessionId
              ? "player1"
              : "player2";

          socket.emit("activeRoom", roomId);
          socket.emit("playerRoleAssigned", playerRole);
          socket.emit("gameStateUpdate", gameState);
        } else {
          socket.emit("activeRoom", roomId);
        }
      } else {
        socket.emit("activeRoom", null);
      }
    }
  });

  
  socket.on("joinGameRoom", async (roomId) => {
    if (roomId) {
      socket.join(roomId);

      
      const gameStateStr = await redisClient.get(`gameState:${roomId}`);
      if (gameStateStr) {
        const gameState = JSON.parse(gameStateStr);

        
        const playerRole =
          gameState.players.player1.id === socket.sessionId
            ? "player1"
            : "player2";

        socket.emit("playerRoleAssigned", playerRole);
        socket.emit("gameStateUpdate", gameState);
      }
    }
  });

  socket.on("makeMove", async (moveData) => {
    const { roomId, from, to, player } = moveData;

    
    const gameStateStr = await redisClient.get(`gameState:${roomId}`);
    if (!gameStateStr) {
      socket.emit("error", "Game not found");
      return;
    }

    const gameState = JSON.parse(gameStateStr);

    
    if (gameState.gameStatus !== "playing") {
      socket.emit("error", "Game is not active");
      return;
    }

    if (gameState.currentPlayer !== player) {
      socket.emit("error", "Not your turn");
      return;
    }

    if (!areAdjacent(from, to)) {
      socket.emit("error", "Dots are not adjacent");
      return;
    }

    if (connectionExists(gameState.connections, from, to)) {
      socket.emit("error", "Connection already exists");
      return;
    }

    
    const newConnection = {
      from,
      to,
      player,
      timestamp: Date.now(),
    };

    gameState.connections.push(newConnection);
    gameState.lastMove = Date.now();

    
    const previousSquares = gameState.completedSquares.slice();
    const allCompletedSquares = checkCompletedSquares(gameState.connections);

    
    const newCompletedSquares = allCompletedSquares.filter(
      (newSquare) =>
        !previousSquares.some(
          (prevSquare) =>
            prevSquare.topLeft.row === newSquare.topLeft.row &&
            prevSquare.topLeft.col === newSquare.topLeft.col
        )
    );

    
    newCompletedSquares.forEach((square) => {
      square.player = player;
    });

    gameState.completedSquares = [...previousSquares, ...newCompletedSquares];

    
    gameState.scores[player] += newCompletedSquares.length;

    
    if (newCompletedSquares.length === 0) {
      gameState.currentPlayer =
        gameState.currentPlayer === "player1" ? "player2" : "player1";
    }

    
    if (gameState.completedSquares.length === 16) {
      gameState.gameStatus = "finished";

      if (gameState.scores.player1 > gameState.scores.player2) {
        gameState.winner = "player1";
      } else if (gameState.scores.player2 > gameState.scores.player1) {
        gameState.winner = "player2";
      } else {
        gameState.winner = "tie";
      }

      
      await redisClient.del(`activeUser:${gameState.players.player1.id}`);
      await redisClient.del(`activeUser:${gameState.players.player2.id}`);

      io.to(roomId).emit("gameFinished", gameState);
    } else {
      io.to(roomId).emit("connectionMade", gameState);
    }

    
    await redisClient.set(`gameState:${roomId}`, JSON.stringify(gameState), {
      EX: 60 * 60,
    });
  });

  socket.on("leaveGame", async () => {
    const roomId = await redisClient.get(`activeUser:${socket.sessionId}`);
    socket.leave(roomId);
    await redisClient.del(`activeUser:${socket.sessionId}`);
    await redisClient.del(`gameState:${roomId}`);
    io.to(roomId).emit("userLeft", socket.sessionId);
  });

  socket.on("leave", async () => {
    await redisClient.del(`onlineUser:${socket.sessionId}`);
    await redisClient.del(`user:${socket.sessionId}`);
    await redisClient.del(`friendRequests:sent:${socket.sessionId}`);
    await redisClient.del(`friendRequests:received:${socket.sessionId}`);
  });

  socket.on("disconnect", async () => {
    const userStr = await redisClient.get(`user:${socket.sessionId}`);
    if (userStr) {
      const user = JSON.parse(userStr);
      console.log(`${user.username} left!`);
    }

    await redisClient.del(`onlineUser:${socket.sessionId}`);
    const keys = await redisClient.keys("onlineUser:*");
    const users = await Promise.all(keys.map((k) => redisClient.get(k)));

    io.emit(
      "onlineUsers",
      Object.values(users).map((userStr) => JSON.parse(userStr))
    );
  });
});

export { httpServer };
