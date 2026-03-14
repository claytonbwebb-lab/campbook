import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import router from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('dev'));

// Stripe webhook needs raw body — must come BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Serve static files (widget + admin)
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', router);

// Admin SPA
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'CampBook API' }));

app.listen(PORT, () => {
  console.log(`CampBook running on port ${PORT}`);
});
