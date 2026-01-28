import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors';
import { db } from '../config/database';
import { users } from '../models/schema';
import { eq } from 'drizzle-orm';
import env from '../config';
import { AuthenticatedRequest } from '../types';

const jwtOptions: StrategyOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: env.JWT_SECRET,
    issuer: 'insurance-claims-api',
    audience: 'insurance-claims-users',
};

passport.use(
    new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
        try {
            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, jwtPayload.sub))
                .limit(1);

            if (!user) {
                return done(null, false);
            }

            if (!user.isActive) {
                return done(new UnauthorizedError('User account is inactive'), false);
            }

            return done(null, user);
        } catch (error) {
            return done(error, false);
        }
    })
);

export const authenticateJwt = passport.authenticate('jwt', { session: false });



export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    authenticateJwt(req, res, (err: unknown) => {
        if (err) {
            return next(err);
        }

        if (!req.user) {
            return next(new UnauthorizedError('Authentication required'));
        }

        next();
    });
}
