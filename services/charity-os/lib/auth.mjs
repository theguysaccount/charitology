import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins/magic-link";
export function authentication({ settings, db, send }) {
  return betterAuth({
    appName: "Charitology OS",
    baseURL: settings.origin,
    secret: settings.secret,
    database: db.pool,
    trustedOrigins: [settings.origin],
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 40 },
    advanced: {
      useSecureCookies: settings.origin.startsWith("https:"),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: settings.origin.startsWith("https:"),
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 10,
        storeToken: "hashed",
        sendMagicLink: async ({ email, token }) => {
          const url = new URL("/auth/confirm", settings.origin);
          url.searchParams.set("token", token);
          await send(
            { purpose: "login", to: email, url: url.toString() },
            `login-${token}`,
          );
        },
      }),
    ],
  });
}
