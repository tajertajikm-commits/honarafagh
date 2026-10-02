import type { RouteDef } from "../router";
import { adminRoutes } from "./admin";
import { authRoutes } from "./auth";
import { cartRoutes } from "./cart";
import { catalogRoutes } from "./catalog";
import { fileRoutes } from "./files";
import { miscRoutes } from "./misc";
import { orderRoutes } from "./orders";
import { paymentRoutes } from "./payments";

/** Every /api/v1 endpoint. See docs/api.md for the list. */
export const ROUTES: RouteDef[] = [
  ...authRoutes,
  ...catalogRoutes,
  ...cartRoutes,
  ...fileRoutes,
  ...orderRoutes,
  ...paymentRoutes,
  ...adminRoutes,
  ...miscRoutes,
];
