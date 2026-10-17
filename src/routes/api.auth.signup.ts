import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(8).max(200) });

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const { email, password } = Body.parse(await api.readJson(request));
          const exists = await api.db().user.findUnique({ where: { email } });
          if (exists) throw new api.ApiError(409, "An account with this email already exists.");
          const user = await api.db().user.create({ data: { email, passwordHash: await api.hashPassword(password) } });
          const cookie = await api.createSession(user.id);
          return api.json({ user: api.userDto(user) }, { status: 201, headers: { "set-cookie": cookie } });
        });
      },
    },
  },
});
