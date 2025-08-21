const rateLimits = new Map();

function checkRateLimit(userId, commandName, limit = 5, window = 60000) {
    const key = `${userId}-${commandName}`;
    const now = Date.now();
    
    if (!rateLimits.has(key)) {
        rateLimits.set(key, { count: 1, resetAt: now + window });
        return true;
    }
    
    const limit = rateLimits.get(key);
    
    if (now > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = now + window;
        return true;
    }
    
    if (limit.count >= limit) {
        return false;
    }
    
    limit.count++;
    return true;
}