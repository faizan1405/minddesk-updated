import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const { email, password } = Body.parse(await api.readJson(request));
          const user = await api.db().user.findUnique({ where: { email } });
          if (!user || !(await api.verifyPassword(password, user.passwordHash)))
            throw new api.ApiError(401, "Incorrect email or password.");
          const cookie = await api.createSession(user.id);
          return api.json({ user: api.userDto(user) }, { headers: { "set-cookie": cookie } });
        });
      },
    },
  },
});
