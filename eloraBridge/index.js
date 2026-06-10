// eloraBridge/index.js

import dotenv from 'dotenv';
dotenv.config(); // ✅ Load environment variables

import express from 'express';
import cors from 'cors';

// ✅ Import microservice routes
import chatRoutes from './routes/chatRoutes.js';
import vscodeBridgeRoutes from './routes/vscodeBridgeRoutes.js';
import logRoutes from './routes/logRoutes.js';
import googleRoutes from './routes/googleRoutes.js'; // 🔁 Now handles Calendar, Gmail, Drive, Sheets

const app = express();

// ✅ CORS Setup (use .env FRONTEND_URL or fallback for dev)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());

// ✅ Mount API routes
app.use('/api/chat', chatRoutes);
app.use('/api/bridge', vscodeBridgeRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/google', googleRoutes); // 🔁 Google API router (calendar, gmail, drive, sheets)

// ✅ Health Check Route
app.get('/', (req, res) => {
  res.send('✅ EloraBridge is active.');
});

// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ✅ Start Server
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`✅ EloraBridge backend listening on port ${PORT}`);
});
export default app;
