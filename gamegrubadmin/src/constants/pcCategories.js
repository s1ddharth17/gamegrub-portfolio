export const PC_CATEGORIES = [
  { value: "high_end_pc", label: "High-End PC" },
  { value: "esports_pc", label: "Esports PC" },
  { value: "console", label: "Console" },
];

export function getPcCategoryLabel(value) {
  return PC_CATEGORIES.find((category) => category.value === value)?.label || "Esports PC";
}
