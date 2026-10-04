import type { Prisma } from "@/generated/prisma/client";
import type {
  ProductCategoryInput,
  ProductInput,
  PurchaseDecisionInput,
  PurchaseRequestInput,
  PurchaseStatus,
} from "@/lib/validation/coins";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, authorizeAny, type Actor } from "@/server/rbac/authorize";
import { getOrganizationId, mustFind, rethrowAsAppError } from "@/server/services/settings/shared";
import { studentScope } from "@/server/services/students/students.service";

import { studentBalance } from "./coins.service";

/* Marketplace (EXP §10 Coins → MARKETPLACE and XARID SO'ROVLARI). A-80. */

export interface ProductCategoryDto {
  id: string;
  name: string;
  productCount: number;
}

export interface ProductDto {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  priceCoins: number;
  stock: number;
  isActive: boolean;
  /** Approved purchases. */
  purchasedCount: number;
}

export interface PurchaseRequestDto {
  id: string;
  studentId: string;
  studentName: string;
  productId: string;
  productName: string;
  coins: number;
  status: PurchaseStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
}

const VIEW = ["reports.view", "coins.manage"] as const;

export async function listProductCategories(
  actor: Actor,
  db: DbClient = prisma,
): Promise<ProductCategoryDto[]> {
  authorizeAny(actor, VIEW);
  const organizationId = await getOrganizationId(db);
  const rows = await db.productCategory.findMany({
    where: { organizationId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, productCount: r._count.products }));
}

export async function createProductCategory(
  actor: Actor,
  input: ProductCategoryInput,
  db: DbClient = prisma,
): Promise<ProductCategoryDto> {
  authorize(actor, "coins.manage");
  const organizationId = await getOrganizationId(db);
  try {
    const row = await db.productCategory.create({ data: { organizationId, name: input.name } });
    await recordAudit(db, actor, {
      action: "productCategory.create",
      entity: "ProductCategory",
      entityId: row.id,
      after: input,
    });
    return { id: row.id, name: row.name, productCount: 0 };
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteProductCategory(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "coins.manage");
  const organizationId = await getOrganizationId(db);
  const row = await mustFind(
    db.productCategory.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { products: true } } },
    }),
    "errors.categoryNotFound",
  );
  if (row._count.products > 0) throw AppError.conflict("errors.categoryHasProducts");
  await db.productCategory.delete({ where: { id } });
  await recordAudit(db, actor, {
    action: "productCategory.delete",
    entity: "ProductCategory",
    entityId: id,
    before: { name: row.name },
  });
}

const productInclude = {
  category: { select: { name: true } },
  _count: { select: { requests: { where: { status: "APPROVED" } } } },
} satisfies Prisma.ProductInclude;

function productToDto(
  row: Prisma.ProductGetPayload<{ include: typeof productInclude }>,
): ProductDto {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    imageUrl: row.imageUrl,
    priceCoins: row.priceCoins,
    stock: row.stock,
    isActive: row.isActive,
    purchasedCount: row._count.requests,
  };
}

export async function listProducts(
  actor: Actor,
  options: { activeOnly?: boolean } = {},
  db: DbClient = prisma,
): Promise<ProductDto[]> {
  authorizeAny(actor, VIEW);
  const organizationId = await getOrganizationId(db);
  const rows = await db.product.findMany({
    where: { organizationId, ...(options.activeOnly ? { isActive: true } : {}) },
    include: productInclude,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return rows.map(productToDto);
}

async function checkCategory(
  db: DbClient,
  organizationId: string,
  categoryId: string,
): Promise<void> {
  const count = await db.productCategory.count({ where: { id: categoryId, organizationId } });
  if (count === 0) throw AppError.validation({ categoryId: ["errors.categoryNotFound"] });
}

export async function createProduct(
  actor: Actor,
  input: ProductInput,
  db: DbClient = prisma,
): Promise<ProductDto> {
  authorize(actor, "coins.manage");
  const organizationId = await getOrganizationId(db);
  await checkCategory(db, organizationId, input.categoryId);
  return db.$transaction(async (tx) => {
    const row = await tx.product.create({
      data: { organizationId, ...input, imageUrl: input.imageUrl ?? null },
      include: productInclude,
    });
    await recordAudit(tx, actor, {
      action: "product.create",
      entity: "Product",
      entityId: row.id,
      after: input,
    });
    return productToDto(row);
  });
}

export async function updateProduct(
  actor: Actor,
  id: string,
  input: ProductInput,
  db: DbClient = prisma,
): Promise<ProductDto> {
  authorize(actor, "coins.manage");
  const organizationId = await getOrganizationId(db);
  const before = await mustFind(
    db.product.findFirst({ where: { id, organizationId } }),
    "errors.productNotFound",
  );
  await checkCategory(db, organizationId, input.categoryId);
  return db.$transaction(async (tx) => {
    const row = await tx.product.update({
      where: { id },
      data: { ...input, imageUrl: input.imageUrl ?? null },
      include: productInclude,
    });
    await recordAudit(tx, actor, {
      action: "product.update",
      entity: "Product",
      entityId: id,
      before,
      after: input,
    });
    return productToDto(row);
  });
}

export async function deleteProduct(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "coins.manage");
  const organizationId = await getOrganizationId(db);
  const row = await mustFind(
    db.product.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { requests: true } } },
    }),
    "errors.productNotFound",
  );
  if (row._count.requests > 0) throw AppError.conflict("errors.productHasRequests");
  await db.product.delete({ where: { id } });
  await recordAudit(db, actor, {
    action: "product.delete",
    entity: "Product",
    entityId: id,
    before: { name: row.name },
  });
}

const requestInclude = {
  student: { select: { fullName: true } },
  product: { select: { name: true } },
  decidedBy: { select: { fullName: true } },
} satisfies Prisma.PurchaseRequestInclude;

function requestToDto(
  row: Prisma.PurchaseRequestGetPayload<{ include: typeof requestInclude }>,
): PurchaseRequestDto {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.fullName,
    productId: row.productId,
    productName: row.product.name,
    coins: row.coins,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedBy?.fullName ?? null,
  };
}

export async function listPurchaseRequests(
  actor: Actor,
  filters: { status?: PurchaseStatus },
  db: DbClient = prisma,
): Promise<PurchaseRequestDto[]> {
  authorizeAny(actor, VIEW);
  const rows = await db.purchaseRequest.findMany({
    where: { student: studentScope(actor), ...(filters.status ? { status: filters.status } : {}) },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map(requestToDto);
}

/** Staff files a request for a student (A-80): the product must be active, in stock and affordable. */
export async function createPurchaseRequest(
  actor: Actor,
  input: PurchaseRequestInput,
  db: DbClient = prisma,
): Promise<PurchaseRequestDto> {
  authorize(actor, "coins.manage");
  const organizationId = await getOrganizationId(db);
  const [student, product] = await Promise.all([
    db.student.findFirst({
      where: { id: input.studentId, ...studentScope(actor) },
      select: { id: true },
    }),
    db.product.findFirst({ where: { id: input.productId, organizationId } }),
  ]);
  if (!student) throw AppError.notFound("errors.studentNotFound");
  if (!product) throw AppError.notFound("errors.productNotFound");
  if (!product.isActive) throw AppError.validation({ productId: ["validation.productInactive"] });
  if (product.stock <= 0) throw AppError.validation({ productId: ["validation.outOfStock"] });
  const balance = await studentBalance(db, input.studentId);
  if (balance < product.priceCoins) {
    throw AppError.validation({ studentId: ["validation.notEnoughCoins"] });
  }
  return db.$transaction(async (tx) => {
    const row = await tx.purchaseRequest.create({
      data: {
        studentId: input.studentId,
        productId: input.productId,
        coins: product.priceCoins,
        createdById: actor.userId,
      },
      include: requestInclude,
    });
    await recordAudit(tx, actor, {
      action: "purchase.request",
      entity: "PurchaseRequest",
      entityId: row.id,
      after: { studentId: input.studentId, productId: input.productId, coins: product.priceCoins },
    });
    return requestToDto(row);
  });
}

/** Approve (spend the coins, take one from stock) or reject a pending request. */
export async function decidePurchaseRequest(
  actor: Actor,
  id: string,
  input: PurchaseDecisionInput,
  db: DbClient = prisma,
): Promise<PurchaseRequestDto> {
  authorize(actor, "coins.manage");
  const row = await mustFind(
    db.purchaseRequest.findFirst({
      where: { id, student: studentScope(actor) },
      include: { product: true },
    }),
    "errors.purchaseNotFound",
  );
  if (row.status !== "PENDING") throw AppError.conflict("errors.purchaseDecided");
  return db.$transaction(async (tx) => {
    let transactionId: string | null = null;
    if (input.status === "APPROVED") {
      if (row.product.stock <= 0)
        throw AppError.validation({ productId: ["validation.outOfStock"] });
      const balance = await studentBalance(tx, row.studentId);
      if (balance < row.coins)
        throw AppError.validation({ studentId: ["validation.notEnoughCoins"] });
      const spend = await tx.coinTransaction.create({
        data: {
          studentId: row.studentId,
          kind: "PURCHASE",
          amount: -row.coins,
          comment: row.product.name,
          givenById: actor.userId,
        },
      });
      transactionId = spend.id;
      await tx.product.update({ where: { id: row.productId }, data: { stock: { decrement: 1 } } });
    }
    const updated = await tx.purchaseRequest.update({
      where: { id },
      data: {
        status: input.status,
        decidedById: actor.userId,
        decidedAt: new Date(),
        transactionId,
      },
      include: requestInclude,
    });
    await recordAudit(tx, actor, {
      action: `purchase.${input.status.toLowerCase()}`,
      entity: "PurchaseRequest",
      entityId: id,
      before: { status: "PENDING" },
      after: { status: input.status },
    });
    return requestToDto(updated);
  });
}
