import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = auth.replace("Bearer ", "");
    const payload = verifyToken(token);
    req.userId = payload.userId;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
