import multer from "multer";
import { env } from "../config/env";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const timestamp = Date.now();
    cb(null, `${timestamp}-${safeName}`);
  }
});

export const upload = multer({ storage });
