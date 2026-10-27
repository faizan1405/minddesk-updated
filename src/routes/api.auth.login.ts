import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

// Fixed-time dummy hash for constant-time rejection on non-existent accounts
const DUMMY_HASH =
  "scrypt$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const {
          checkRateLimit,
          recordFailedAttempt,
          resetRateLimit,
          extractClientIp,
          acquireAdmission,
        } = await import("@/lib/server/rate-limiter.server");

        return api.handle(async () => {
          await api.bootstrapOwnerAccount();
          const { email, password } = Body.parse(await api.readJson(request));

          const clientIp = extractClientIp(request);
          const ipKey = `login:ip:${clientIp}`;
          const accountKey = `login:account:${email}`;

          // Pre-verification admission: limit concurrent in-flight scrypt hashing operations per IP and account
          const releaseAdmission = acquireAdmission([ipKey, accountKey]);
          try {
            // 1. Check rate limits before executing expensive scrypt hashing
            await checkRateLimit([ipKey, accountKey], "login attempts");

            const user = await api.db().user.findUnique({ where: { email } });
            const isValid = user
              ? await api.verifyPassword(password, user.passwordHash)
              : await api.verifyPassword(password, DUMMY_HASH);

            if (!user || !isValid) {
              // 2. Record failed attempt: 10 max per IP, 5 max per account in 15 minutes
              await recordFailedAttempt(ipKey, 10, 15 * 60 * 1000, 15 * 60 * 1000);
              await recordFailedAttempt(accountKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
              throw new api.ApiError(401, "Incorrect email or password.");
            }

            // 3. Successful login: reset failed counters for this account ONLY.
            // Never reset IP rate limit counter on login to prevent attackers with valid credentials
            // from resetting IP rate limits while brute-forcing other accounts.
            await resetRateLimit([accountKey]);

            const cookie = await api.createSession(user.id);
            return api.json({ user: api.userDto(user) }, { headers: { "set-cookie": cookie } });
          } finally {
            releaseAdmission();
          }
        });
      },
    },
  },
});
