import { relations } from "drizzle-orm";
import {
  pricingRuleSets,
  pricingRuleVersions,
  productCategories,
  productImages,
  productMethods,
  productOptionGroups,
  productOptionValues,
  products,
  workflowTemplateSteps,
  workflowTemplates,
} from "./catalog";
import { deliveryMethods, payments, shipmentItems, shipments, vehicles } from "./finance";
import { addresses, customers, employeeRoles, employees, rolePermissions, roles, users } from "./identity";
import {
  machineMaintenance,
  machines,
  materialCategories,
  materialRequests,
  materialRequirements,
  materials,
  purchaseOrderLines,
  purchaseOrders,
  stockLevels,
  suppliers,
  warehouseLocations,
} from "./inventory";
import {
  artworkVersions,
  cartItems,
  carts,
  fileObjects,
  inquiries,
  orderEvents,
  orderItems,
  orders,
  quoteItems,
  quotes,
} from "./orders";
import { productionIssues, productionJobs, productionTasks, qcDefects, qcInspections } from "./production";

export const usersRelations = relations(users, ({ one }) => ({
  customer: one(customers, { fields: [users.id], references: [customers.userId] }),
  employee: one(employees, { fields: [users.id], references: [employees.userId] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(users, { fields: [customers.userId], references: [users.id] }),
  addresses: many(addresses),
  orders: many(orders),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  roles: many(employeeRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  employees: many(employeeRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const employeeRolesRelations = relations(employeeRoles, ({ one }) => ({
  employee: one(employees, { fields: [employeeRoles.employeeId], references: [employees.id] }),
  role: one(roles, { fields: [employeeRoles.roleId], references: [roles.id] }),
}));

// ── Catalog ─────────────────────────────────────────────────────────────────

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, { fields: [products.categoryId], references: [productCategories.id] }),
  ruleSet: one(pricingRuleSets, { fields: [products.pricingRuleSetId], references: [pricingRuleSets.id] }),
  images: many(productImages),
  methods: many(productMethods),
  groups: many(productOptionGroups),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productMethodsRelations = relations(productMethods, ({ one }) => ({
  product: one(products, { fields: [productMethods.productId], references: [products.id] }),
}));

export const productOptionGroupsRelations = relations(productOptionGroups, ({ one, many }) => ({
  product: one(products, { fields: [productOptionGroups.productId], references: [products.id] }),
  values: many(productOptionValues),
}));

export const productOptionValuesRelations = relations(productOptionValues, ({ one }) => ({
  group: one(productOptionGroups, { fields: [productOptionValues.groupId], references: [productOptionGroups.id] }),
}));

export const pricingRuleSetsRelations = relations(pricingRuleSets, ({ many }) => ({
  versions: many(pricingRuleVersions),
}));

export const pricingRuleVersionsRelations = relations(pricingRuleVersions, ({ one }) => ({
  ruleSet: one(pricingRuleSets, { fields: [pricingRuleVersions.ruleSetId], references: [pricingRuleSets.id] }),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ many }) => ({
  steps: many(workflowTemplateSteps),
}));

export const workflowTemplateStepsRelations = relations(workflowTemplateSteps, ({ one }) => ({
  template: one(workflowTemplates, { fields: [workflowTemplateSteps.templateId], references: [workflowTemplates.id] }),
}));

// ── Quotes / cart / orders ──────────────────────────────────────────────────

export const inquiriesRelations = relations(inquiries, ({ one }) => ({
  customer: one(customers, { fields: [inquiries.customerId], references: [customers.id] }),
  product: one(products, { fields: [inquiries.productId], references: [products.id] }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  customer: one(customers, { fields: [quotes.customerId], references: [customers.id] }),
  inquiry: one(inquiries, { fields: [quotes.inquiryId], references: [inquiries.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
  product: one(products, { fields: [quoteItems.productId], references: [products.id] }),
}));

export const cartsRelations = relations(carts, ({ many }) => ({
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  deliveryMethod: one(deliveryMethods, { fields: [orders.deliveryMethodId], references: [deliveryMethods.id] }),
  items: many(orderItems),
  events: many(orderEvents),
  payments: many(payments),
  shipments: many(shipments),
  jobs: many(productionJobs),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  artwork: many(artworkVersions),
  requirements: many(materialRequirements),
  job: one(productionJobs, { fields: [orderItems.id], references: [productionJobs.orderItemId] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
  actor: one(users, { fields: [orderEvents.actorId], references: [users.id] }),
}));

export const artworkVersionsRelations = relations(artworkVersions, ({ one }) => ({
  item: one(orderItems, { fields: [artworkVersions.orderItemId], references: [orderItems.id] }),
  file: one(fileObjects, { fields: [artworkVersions.fileId], references: [fileObjects.id] }),
  uploader: one(users, { fields: [artworkVersions.uploadedBy], references: [users.id] }),
}));

// ── Inventory / procurement / machines ──────────────────────────────────────

export const materialsRelations = relations(materials, ({ one, many }) => ({
  category: one(materialCategories, { fields: [materials.categoryCode], references: [materialCategories.code] }),
  supplier: one(suppliers, { fields: [materials.defaultSupplierId], references: [suppliers.id] }),
  defaultLocation: one(warehouseLocations, { fields: [materials.defaultLocationId], references: [warehouseLocations.id] }),
  stock: many(stockLevels),
}));

export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  material: one(materials, { fields: [stockLevels.materialId], references: [materials.id] }),
  location: one(warehouseLocations, { fields: [stockLevels.locationId], references: [warehouseLocations.id] }),
}));

export const materialRequirementsRelations = relations(materialRequirements, ({ one }) => ({
  material: one(materials, { fields: [materialRequirements.materialId], references: [materials.id] }),
  order: one(orders, { fields: [materialRequirements.orderId], references: [orders.id] }),
  item: one(orderItems, { fields: [materialRequirements.orderItemId], references: [orderItems.id] }),
  location: one(warehouseLocations, { fields: [materialRequirements.locationId], references: [warehouseLocations.id] }),
}));

export const materialRequestsRelations = relations(materialRequests, ({ one }) => ({
  material: one(materials, { fields: [materialRequests.materialId], references: [materials.id] }),
  requirement: one(materialRequirements, { fields: [materialRequests.requirementId], references: [materialRequirements.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  lines: many(purchaseOrderLines),
}));

export const purchaseOrderLinesRelations = relations(purchaseOrderLines, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderLines.purchaseOrderId], references: [purchaseOrders.id] }),
  material: one(materials, { fields: [purchaseOrderLines.materialId], references: [materials.id] }),
}));

export const machinesRelations = relations(machines, ({ one, many }) => ({
  defaultOperator: one(employees, { fields: [machines.defaultOperatorId], references: [employees.id] }),
  maintenance: many(machineMaintenance),
  tasks: many(productionTasks),
}));

export const machineMaintenanceRelations = relations(machineMaintenance, ({ one }) => ({
  machine: one(machines, { fields: [machineMaintenance.machineId], references: [machines.id] }),
}));

// ── Production / QC ─────────────────────────────────────────────────────────

export const productionJobsRelations = relations(productionJobs, ({ one, many }) => ({
  order: one(orders, { fields: [productionJobs.orderId], references: [orders.id] }),
  item: one(orderItems, { fields: [productionJobs.orderItemId], references: [orderItems.id] }),
  template: one(workflowTemplates, { fields: [productionJobs.templateId], references: [workflowTemplates.id] }),
  tasks: many(productionTasks),
}));

export const productionTasksRelations = relations(productionTasks, ({ one, many }) => ({
  job: one(productionJobs, { fields: [productionTasks.jobId], references: [productionJobs.id] }),
  order: one(orders, { fields: [productionTasks.orderId], references: [orders.id] }),
  machine: one(machines, { fields: [productionTasks.machineId], references: [machines.id] }),
  assignee: one(employees, { fields: [productionTasks.assigneeId], references: [employees.id] }),
  issues: many(productionIssues),
}));

export const productionIssuesRelations = relations(productionIssues, ({ one }) => ({
  task: one(productionTasks, { fields: [productionIssues.taskId], references: [productionTasks.id] }),
}));

export const qcInspectionsRelations = relations(qcInspections, ({ one, many }) => ({
  task: one(productionTasks, { fields: [qcInspections.taskId], references: [productionTasks.id] }),
  defects: many(qcDefects),
}));

export const qcDefectsRelations = relations(qcDefects, ({ one }) => ({
  inspection: one(qcInspections, { fields: [qcDefects.inspectionId], references: [qcInspections.id] }),
}));

// ── Finance / delivery ──────────────────────────────────────────────────────

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  method: one(deliveryMethods, { fields: [shipments.methodId], references: [deliveryMethods.id] }),
  assignee: one(employees, { fields: [shipments.assigneeId], references: [employees.id] }),
  vehicle: one(vehicles, { fields: [shipments.vehicleId], references: [vehicles.id] }),
  items: many(shipmentItems),
}));

export const shipmentItemsRelations = relations(shipmentItems, ({ one }) => ({
  shipment: one(shipments, { fields: [shipmentItems.shipmentId], references: [shipments.id] }),
  item: one(orderItems, { fields: [shipmentItems.orderItemId], references: [orderItems.id] }),
}));
