// authBridge/index.js

import dotenv from 'dotenv';
dotenv.config(); // ✅ Load .env first
import tokenRoutes from './routes/tokenRoutes.js';

import express from 'express';
import cors from 'cors';

// ✅ Import route modules
import authRoutes from './routes/authRoutes.js';
import googleRoutes from './routes/googleRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import gmailRoutes from './routes/gmailRoutes.js';
import driveRoutes from './routes/driveRoutes.js';
import sheetsRoutes from './routes/sheetsRoutes.js';
import notionRoutes from './routes/notionRoutes.js';

const app = express();

app.use('/api/token', tokenRoutes);

// ✅ Secure CORS: only your frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// ✅ Mount all microservice routes
app.use('/api/auth', authRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/notion', notionRoutes);

// ✅ Health check endpoint
app.get('/', (req, res) => {
  res.send('✅ AuthBridge is up and healthy.');
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ✅ Always include server listen for direct runs or deployment
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`✅ AuthBridge listening on port ${PORT}`);
});
