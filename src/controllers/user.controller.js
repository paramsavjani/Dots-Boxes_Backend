import asyncHandler from "../utils/asyncHandler.js";
import { redisClient } from "../index.js";

const onlineUsers = asyncHandler(async (req, res) => {
  const keys = await redisClient.keys("onlineUser:*");
  const users = await Promise.all(keys.map((k) => redisClient.get(k)));
  res.json(Object.values(users).map((user) => JSON.parse(user)));
});

const checkUsername = asyncHandler(async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }
  const keys = await redisClient.keys("user:*");
  const users = await Promise.all(keys.map((k) => redisClient.get(k)));
  console.log(users);
  const existingUser = Object.values(users).filter((userStr) => {
    const user = JSON.parse(userStr);
    return user.username === username;
  });
  if (existingUser.length === 0) {
    return res.status(200).json({ message: "Username is available" });
  }
  res.status(404).json({ message: "Username is already taken" });
});

const getRequests = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  const sentKey = `friendRequests:sent:${sessionId}`;
  const receivedKey = `friendRequests:received:${sessionId}`;

  const sentRequests = await redisClient.sMembers(sentKey);
  const receivedRequests = await redisClient.sMembers(receivedKey);
  const sent = sentRequests.map((r) => {
    const data = JSON.parse(r);
    return {
      from: "me",
      to: data.to,
    };
  });

  const received = receivedRequests.map((r) => {
    const data = JSON.parse(r);
    return {
      from: data.from,
      to: "me",
    };
  });

  const allRequests = [...sent, ...received];

  res.status(200).json(allRequests);
});

export { onlineUsers, checkUsername, getRequests };
