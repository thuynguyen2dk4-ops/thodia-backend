import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebase';

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken; // Lưu user vào request
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};