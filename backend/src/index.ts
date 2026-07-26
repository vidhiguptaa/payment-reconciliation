import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables before importing other services
dotenv.config();

import authRouter from './routers/auth';
import paymentsRouter from './routers/payments';
import statementsRouter from './routers/statements';
import reconciliationRouter from './routers/reconciliation';
import { seedDatabase } from './seed';
import { prisma } from './db';

const app = express();
const port = process.env.PORT || 3001;

// Global Middleware Configuration
app.use(cors({
  origin: '*', // Allow all origins for simplicity (can restrict in production)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routing Registrations
app.use('/api/auth', authRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/statements', statementsRouter);
app.use('/api/reconciliation', reconciliationRouter);

// Root level endpoints matching API specifications
app.use('/', authRouter);
app.use('/', paymentsRouter);
app.use('/', statementsRouter);
app.use('/', reconciliationRouter);

// Basic Health Check Route
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Perform quick query verification to ensure DB connection is active
    await prisma.$queryRaw`SELECT 1`;
    return res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message || String(error),
    });
  }
});

// Centralized Catch-All Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  return res.status(err.status || 500).json({
    error: err.message || 'Internal server error occurred on the API backend.',
  });
});

// Initialize database and start the server
async function startServer() {
  try {
    console.log('Connecting to PostgreSQL database via Prisma...');
    await prisma.$connect();
    console.log('Database connected successfully.');

    // Seed database with default admin user if empty
    await seedDatabase();

    app.listen(port, () => {
      console.log(`===============================================`);
      console.log(` Payment Reconciliation API backend is running `);
      console.log(` Local URL: http://localhost:${port}          `);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
