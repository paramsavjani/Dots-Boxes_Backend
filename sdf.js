import Redis from "ioredis";

const redis = new Redis();

// Flush current DB
await redis.flushdb();

// Or flush all DBs
await redis.flushall();

// Or delete by key
await redis.del("onlineUsers");