import { View, type StyleProp, type ViewStyle } from "react-native";

import { Select } from "@/components/select";
import { centreToday, dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";

/** The years on offer, as the site's: next year, this one and three back. */
const YEAR_STEPS = [1, 0, -1, -2, -3];
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** This year and this month (1 to 12) in the centre's zone. */
export function centreMonth(): { year: number; month: number } {
  const today = centreToday();
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

/** "2026-11" for a year and a month. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** A month's name: "Nov", or with its year "Nov 2026". */
export function useMonthName(): (month: number, year?: number) => string {
  const date = useDate();
  return (month, year) =>
    date(
      dayAsDate(`${monthKey(year ?? 2026, month)}-01`),
      year ? { month: "short", year: "numeric" } : { month: "short" },
    );
}

/** The year and the month ("Whole year" is no month) every finance page is narrowed by. */
export function PeriodSelects({
  year,
  month,
  onYear,
  onMonth,
  cell,
  testID,
}: {
  year: number;
  month: number | null;
  onYear: (year: number) => void;
  onMonth: (month: number | null) => void;
  /** The style of the box around each of the two fields. */
  cell: StyleProp<ViewStyle>;
  testID: string;
}) {
  const tf = useTranslations("finance.filters");
  const monthName = useMonthName();
  const thisYear = centreMonth().year;
  return (
    <>
      <View style={cell}>
        <Select
          compact
          label={tf("year")}
          value={String(year)}
          onChange={(value) => onYear(value ? Number(value) : thisYear)}
          options={YEAR_STEPS.map((step) => {
            const y = String(thisYear + step);
            return { value: y, label: y };
          })}
          testID={`${testID}-year`}
        />
      </View>
      <View style={cell}>
        <Select
          compact
          label={tf("month")}
          value={month === null ? "all" : String(month)}
          onChange={(value) => onMonth(!value || value === "all" ? null : Number(value))}
          options={[
            { value: "all", label: tf("wholeYear") },
            ...MONTHS.map((m) => ({ value: String(m), label: monthName(m) })),
          ]}
          testID={`${testID}-month`}
        />
      </View>
    </>
  );
}
