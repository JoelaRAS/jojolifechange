import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

type JwtPayload = {
  userId: string;
};

export const signToken = (
  payload: JwtPayload,
  expiresIn: SignOptions["expiresIn"] = "7d"
) => {
  const options: SignOptions = {};
  if (expiresIn) {
    options.expiresIn = expiresIn;
  }
  return jwt.sign(payload, env.jwtSecret, options);
};

export const verifyToken = (token: string) =>
  jwt.verify(token, env.jwtSecret) as JwtPayload;
