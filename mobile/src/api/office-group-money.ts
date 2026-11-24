import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { MembershipStatus } from "./types";

/*
 * A group's discounts and lesson packages for the app (A-254): the site's
 * Discounts and Packages tabs of a group's page. Every call here is the
 * site's own.
 */

export interface Discount {
  id: string;
  membershipId: string;
  studentId: string;
  studentName: string;
  /** What a month costs with the discount. */
  discountedPrice: number;
  /** How much less than the regular price that is, as a sum and in percent. */
  amount: number;
  percent: number;
  months: number;
  remainingMonths: number;
  givenAt: string;
  comment: string | null;
  createdByName: string | null;
  /** Set when the discount is the family's; that one is managed on the student's page. */
  familyId: string | null;
}

export interface DiscountInput {
  membershipId: string;
  discountedPrice: number;
  months: number;
  comment: string | null;
}

export interface LessonPackage {
  id: string;
  groupId: string;
  name: string;
  lessons: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  /** How many times it was sold; a sold package is not deleted, only taken off sale. */
  sold: number;
}

export interface PackageCredits {
  membershipId: string;
  studentId: string;
  studentName: string;
  status: MembershipStatus;
  purchased: number;
  used: number;
  /** Bought minus used; below zero when lessons are owed. */
  left: number;
  lastPurchaseAt: string | null;
}

export interface PackagePurchase {
  id: string;
  membershipId: string;
  studentName: string;
  name: string;
  lessons: number;
  used: number;
  price: number;
  purchasedAt: string;
  note: string | null;
  paymentId: string | null;
  createdByName: string | null;
}

export interface GroupPackages {
  packages: LessonPackage[];
  credits: PackageCredits[];
  purchases: PackagePurchase[];
}

export interface PackageInput {
  name: string;
  lessons: number;
  price: number;
  isActive: boolean;
}

export interface SellPackageInput {
  membershipId: string;
  packageId: string;
  paymentMethodId: string;
  paidAt: string;
  comment: string | null;
}

export const groupMoneyKeys = {
  discounts: (id: string) => ["group", id, "discounts"] as const,
  packages: (id: string) => ["group", id, "packages"] as const,
};

export function useGroupDiscounts(id: string) {
  return useQuery({
    queryKey: groupMoneyKeys.discounts(id),
    queryFn: ({ signal }) => api<Discount[]>(`/groups/${id}/discounts`, { signal }),
  });
}

/**
 * Gives a discount to a member of the group, or (with `remove`) ends one now.
 * A discount changes what the student is charged: the group's students and
 * every student's page are asked for again.
 */
export function useDiscountChange(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: { give: DiscountInput } | { remove: string }): Promise<unknown> =>
      "give" in change
        ? api(`/groups/${groupId}/discounts`, { method: "POST", body: change.give })
        : api(`/discounts/${change.remove}`, { method: "DELETE" }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: groupMoneyKeys.discounts(groupId) }),
        client.invalidateQueries({ queryKey: ["group", groupId, "members"] }),
        client.invalidateQueries({ queryKey: ["students"] }),
      ]),
  });
}

export function useGroupPackages(id: string) {
  return useQuery({
    queryKey: groupMoneyKeys.packages(id),
    queryFn: ({ signal }) => api<GroupPackages>(`/groups/${id}/packages`, { signal }),
  });
}

export type PackageChange =
  | { add: PackageInput }
  | { change: string; input: PackageInput }
  /** Removes an unsold package; the server only takes a sold one off sale. */
  | { remove: string };

/** Adds a package to the group's offers, changes one or removes one. */
export function usePackageChange(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: PackageChange): Promise<unknown> => {
      if ("add" in change) {
        return api(`/groups/${groupId}/packages`, { method: "POST", body: change.add });
      }
      if ("change" in change) {
        return api(`/groups/${groupId}/packages/${change.change}`, {
          method: "PATCH",
          body: change.input,
        });
      }
      return api(`/groups/${groupId}/packages/${change.remove}`, { method: "DELETE" });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: groupMoneyKeys.packages(groupId) }),
  });
}

/**
 * Sells a package to a member: the payment and the lessons in one go. It is a
 * payment, so what a payment changes is asked for again: balances, the
 * student's page, the cash desk and the home's figures.
 */
export function useSellPackage(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SellPackageInput) =>
      api<unknown>(`/groups/${groupId}/packages/sell`, { method: "POST", body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: groupMoneyKeys.packages(groupId) }),
        client.invalidateQueries({ queryKey: ["group", groupId, "members"] }),
        client.invalidateQueries({ queryKey: ["students"] }),
        client.invalidateQueries({ queryKey: ["payments"] }),
        client.invalidateQueries({ queryKey: ["cashdesk"] }),
        client.invalidateQueries({ queryKey: ["office"] }),
      ]),
  });
}
