import jwt from 'jsonwebtoken';
import prisma from './prisma.js';

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Assuming tenant email is stored in the JWT payload
    const tenant = await prisma.tenant.findUnique({
      where: { email: decoded.email },
    });

    if (!tenant) {
      return res.status(401).json({ message: 'Tenant not found' });
    }

    req.tenant = tenant; // Attach tenant to request object
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

export default authMiddleware;
