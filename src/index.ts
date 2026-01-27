import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { rateLimit } from 'express-rate-limit';

import env from './config';
import { logger } from './utils/logger';
import { setupDatabase } from './config/database';
import { errorHandler } from './middleware/error.middleware';
import routes from './routes';

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

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
    });
});


// Error handling
app.use(errorHandler);

async function startServer() {
    try {
        // Initialize database
        await setupDatabase();

        app.listen(env.PORT, () => {
            logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;