import { Router } from "express";
import { onlineUsers,checkUsername} from "../controllers/user.controller.js";

const router = Router();

router.route("/onlineUsers").get(onlineUsers);
router.route("/checkUsername").post(checkUsername);

export default router;