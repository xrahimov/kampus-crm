import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, apiForm, type PickedFile } from "@/lib/api";

import { reportQuery } from "./office-reports";

/*
 * Reports, Coins (A-239): the rating of students by coins, the marketplace
 * (what coins buy) and the purchase requests. The calls the site's page makes.
 */

export const COINS_TABS = ["rating", "marketplace", "requests"] as const;
export type CoinsTab = (typeof COINS_TABS)[number];

export const COIN_PERIODS = ["WEEK", "MONTH", "ALL"] as const;
export type CoinPeriod = (typeof COIN_PERIODS)[number];

export const PURCHASE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export interface CoinRatingRow {
  rank: number;
  studentId: string;
  fullName: string;
  branchName: string;
  balance: number;
  earned: number;
  spent: number;
  lastActivity: string | null;
}

export interface CoinsReport {
  kpis: { totalGiven: number; totalSpent: number; purchases: number; activeStudents: number };
  rating: CoinRatingRow[];
}

export interface CoinReportOptions {
  branches: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  groups: Array<{ id: string; name: string; branchId: string; courseId: string }>;
}

export interface CoinRatingFilters {
  q: string;
  branchId: string | null;
  courseId: string | null;
  groupId: string | null;
  period: CoinPeriod;
}

export type CoinEvent =
  "ATTENDANCE" | "HOMEWORK" | "TEST_RESULT" | "BIRTHDAY" | "REFERRAL" | "VOCAB_STREAK";

export interface CoinTransaction {
  id: string;
  studentId: string;
  groupName: string | null;
  kind: "MANUAL" | "AUTO" | "PURCHASE";
  amount: number;
  reasonName: string | null;
  event: CoinEvent | null;
  comment: string | null;
  givenByName: string | null;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  productCount: number;
}

export interface Product {
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

export interface ProductInput {
  name: string;
  categoryId: string;
  imageUrl: string | null;
  priceCoins: number;
  stock: number;
  isActive: boolean;
}

export interface PurchaseRequest {
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

export interface CoinStudent {
  id: string;
  fullName: string;
  phone: string | null;
  balance: number;
}

export const coinKeys = {
  all: ["coins-report"] as const,
  report: (filters: CoinRatingFilters) => ["coins-report", "rating", filters] as const,
  options: ["coins-report", "options"] as const,
  history: (studentId: string) => ["coins-report", "history", studentId] as const,
  categories: ["coins-report", "categories"] as const,
  products: ["coins-report", "products"] as const,
  requests: (status: PurchaseStatus | null) => ["coins-report", "requests", status] as const,
  students: (q: string) => ["coins-report", "students", q] as const,
};

/** The key figures and the rating; the period is sent only when it is not "all time". */
export function useCoinsReport(filters: CoinRatingFilters) {
  return useQuery({
    queryKey: coinKeys.report(filters),
    queryFn: ({ signal }) =>
      api<CoinsReport>(
        `/coins/report${reportQuery({
          q: filters.q,
          branchId: filters.branchId,
          courseId: filters.courseId,
          groupId: filters.groupId,
          period: filters.period === "ALL" ? null : filters.period,
        })}`,
        { signal },
      ),
    placeholderData: (previous) => previous,
  });
}

export function useCoinReportOptions() {
  return useQuery({
    queryKey: coinKeys.options,
    queryFn: ({ signal }) => api<CoinReportOptions>("/coins/options", { signal }),
    staleTime: 60_000,
  });
}

/** One student's balance and what it is made of, newest first. */
export function useCoinHistory(studentId: string | null) {
  return useQuery({
    queryKey: coinKeys.history(studentId ?? ""),
    queryFn: ({ signal }) =>
      api<{ balance: number; items: CoinTransaction[] }>(`/students/${studentId}/coins`, {
        signal,
      }),
    enabled: studentId !== null,
  });
}

export function useProductCategories(enabled: boolean) {
  return useQuery({
    queryKey: coinKeys.categories,
    queryFn: ({ signal }) => api<ProductCategory[]>("/marketplace/categories", { signal }),
    enabled,
  });
}

export function useProducts(enabled: boolean) {
  return useQuery({
    queryKey: coinKeys.products,
    queryFn: ({ signal }) => api<Product[]>("/marketplace/products", { signal }),
    enabled,
  });
}

export function usePurchaseRequests(status: PurchaseStatus | null, enabled: boolean) {
  return useQuery({
    queryKey: coinKeys.requests(status),
    queryFn: ({ signal }) =>
      api<PurchaseRequest[]>(`/marketplace/purchase-requests${reportQuery({ status })}`, {
        signal,
      }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

/** Students by name or phone with their balances, for a purchase request. */
export function useCoinStudents(q: string, enabled: boolean) {
  return useQuery({
    queryKey: coinKeys.students(q),
    queryFn: ({ signal }) => api<CoinStudent[]>(`/coins/students${reportQuery({ q })}`, { signal }),
    enabled: enabled && q.length >= 2,
  });
}

/** Adds a category of products, or removes one that has no products. */
export function useCategoryStep() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (step: { do: "add"; name: string } | { do: "remove"; id: string }) =>
      step.do === "add"
        ? api<unknown>("/marketplace/categories", { method: "POST", body: { name: step.name } })
        : api<unknown>(`/marketplace/categories/${step.id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: coinKeys.categories }),
  });
}

/** Adds a product, or with an id changes one. */
export function useSaveProduct(id: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) =>
      api<Product>(id ? `/marketplace/products/${id}` : "/marketplace/products", {
        method: id ? "PATCH" : "POST",
        body: input,
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: coinKeys.products }),
        client.invalidateQueries({ queryKey: coinKeys.categories }),
      ]),
  });
}

export function useDeleteProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/marketplace/products/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: coinKeys.products }),
        client.invalidateQueries({ queryKey: coinKeys.categories }),
      ]),
  });
}

/** Sends a product's picture; the answer is the address the product keeps. */
export function uploadPicture(file: PickedFile): Promise<{ url: string }> {
  return apiForm<{ url: string }>("/uploads", {}, file);
}

/** Staff asks for a product on a student's behalf. */
export function useAddPurchaseRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: string; productId: string }) =>
      api<PurchaseRequest>("/marketplace/purchase-requests", { method: "POST", body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["coins-report", "requests"] }),
  });
}

/** Approving spends the student's coins and takes one from the stock; both show everywhere after. */
export function useDecidePurchase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: "APPROVED" | "REJECTED" }) =>
      api<PurchaseRequest>(`/marketplace/purchase-requests/${input.id}`, {
        method: "PATCH",
        body: { status: input.status },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: coinKeys.all }),
  });
}
