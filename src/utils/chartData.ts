export interface ChartDataSeries {
  key: string;
  label: string;
  color?: string;
}

export interface MarkdownColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface MarkdownTable {
  title?: string;
  columns: readonly MarkdownColumn[];
  rows: readonly Record<string, unknown>[];
}

export interface MarkdownSection {
  title: string;
  metadata?: readonly [string, unknown][];
  tables: readonly MarkdownTable[];
}

export function pickDataKeys(
  rows: readonly unknown[],
  keys: readonly string[],
): Record<string, unknown>[] {
  const uniqueKeys = Array.from(new Set(keys));

  return rows.map((row) => {
    const source = row != null && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const selected: Record<string, unknown> = {};

    for (const key of uniqueKeys) {
      if (Object.hasOwn(source, key)) {
        selected[key] = source[key];
      }
    }

    return selected;
  });
}

export function seriesToColumns(
  labelColumn: MarkdownColumn,
  series: readonly ChartDataSeries[],
): MarkdownColumn[] {
  return [
    labelColumn,
    ...series.map((item) => ({
      key: item.key,
      label: item.label,
      align: "right" as const,
    })),
  ];
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "None" : value.map((item) => String(item)).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null) return "";
  return String(value);
}

function formatMarkdownValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return String(value);
    return Number(value.toPrecision(12)).toString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeMarkdownCell(value: unknown): string {
  return formatMarkdownValue(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function separatorForColumn(column: MarkdownColumn): string {
  return column.align === "right" ? "---:" : "---";
}

export function buildMarkdownTable(table: MarkdownTable): string {
  if (table.rows.length === 0) return "";

  const lines = [
    `| ${table.columns.map((column) => escapeMarkdownCell(column.label)).join(" | ")} |`,
    `| ${table.columns.map(separatorForColumn).join(" | ")} |`,
  ];

  for (const row of table.rows) {
    lines.push(
      `| ${table.columns.map((column) => escapeMarkdownCell(row[column.key])).join(" | ")} |`,
    );
  }

  return lines.join("\n");
}

export function buildMarkdownSection(section: MarkdownSection): string {
  const parts = [`## ${section.title}`];

  if (section.metadata && section.metadata.length > 0) {
    parts.push(
      section.metadata
        .map(([label, value]) => `- ${label}: ${formatMetadataValue(value)}`)
        .join("\n"),
    );
  }

  for (const table of section.tables) {
    const markdownTable = buildMarkdownTable(table);
    if (!markdownTable) continue;
    if (table.title) parts.push(`### ${table.title}\n\n${markdownTable}`);
    else parts.push(markdownTable);
  }

  return parts.join("\n\n");
}
