import { ROUTES } from "@/server/http/api";
import { createDispatcher } from "@/server/http/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dispatch = createDispatcher(ROUTES);
export { dispatch as GET, dispatch as POST, dispatch as PATCH, dispatch as PUT, dispatch as DELETE };
