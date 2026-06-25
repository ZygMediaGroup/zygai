import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('CRITICAL: JWT_SECRET environment variable is missing in production!');
  process.exit(1);
}
const SECRET_TO_USE = JWT_SECRET || 'zygai-dev-secret';
const JWT_EXPIRES_IN = '7d';
const readAdminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const hashPassword = async (password) => bcrypt.hash(password, 12);
export const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);

export const signToken = (payload) => jwt.sign(payload, SECRET_TO_USE, { expiresIn: JWT_EXPIRES_IN });

export const verifyToken = (token) => jwt.verify(token, SECRET_TO_USE);

export const isAdminEmail = (email) => readAdminEmails().includes(email.toLowerCase());
