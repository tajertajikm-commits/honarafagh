import type { RouteDef } from "../router";
import { adminRoutes } from "./admin";
import { authRoutes } from "./auth";
import { cartRoutes } from "./cart";
import { catalogRoutes } from "./catalog";
import { deliveryRoutes } from "./delivery";
import { fileRoutes } from "./files";
import { inventoryRoutes } from "./inventory";
import { miscRoutes } from "./misc";
import { orderRoutes } from "./orders";
import { paymentRoutes } from "./payments";
import { productionRoutes } from "./production";
import { quoteRoutes } from "./quotes";

/** Every /api/v1 endpoint. See docs/api.md for the list. */
export const ROUTES: RouteDef[] = [
  ...authRoutes,
  ...catalogRoutes,
  ...cartRoutes,
  ...fileRoutes,
  ...orderRoutes,
  ...paymentRoutes,
  ...productionRoutes,
  ...inventoryRoutes,
  ...deliveryRoutes,
  ...quoteRoutes,
  ...adminRoutes,
  ...miscRoutes,
];
