import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { rateLimit } from 'express-rate-limit';

import env from './config';
import { logger } from './utils/logger';
import { setupDatabase } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import routes from './routes';
import { setupRedis } from './config/redis';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: env.NODE_ENV === 'production' ? ['https://domain.com'] : true,
    credentials: true,
}));

// Rate limiting per tenant (TODO: implement in tenant middleware)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(globalLimiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('user-agent'),
        });
    });
    next();
});

// Routes
app.use('/api', routes);

app.use(notFoundHandler);
// Error handling
app.use(errorHandler);
 
async function startServer() {
    try {
        // Initialize database
        await setupDatabase();

        // Initialize Redis
        await setupRedis();

        console.log("PORT --->", env.PORT)

        app.listen(env.PORT, () => {
            logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
            logger.info(`Database connected: ${env.DATABASE_URL?.split('@')[1]}`);
            logger.info(`Redis connected: ${env.REDIS_URL}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

startServer();

export default app;