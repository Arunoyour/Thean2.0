export const DEFAULT_PAGE_SIZE = 10;

function escapeCell(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function getPageCount(items, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(items.length / pageSize));
}

export function paginate(items, page, pageSize = DEFAULT_PAGE_SIZE) {
  const safePage = Math.min(Math.max(page, 1), getPageCount(items, pageSize));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function exportRowsToExcel(filename, sheetName, columns, rows) {
  const headerHtml = columns.map((column) => `<th>${escapeCell(column.label)}</th>`).join("");
  const rowsHtml = rows
    .map((row) => {
      const cells = columns
        .map((column) => `<td>${escapeCell(column.value(row))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const workbook = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
        <x:Name>${escapeCell(sheetName)}</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head>
      <body><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></body>
    </html>
  `;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function pageLabel(page, items, pageSize = DEFAULT_PAGE_SIZE) {
  if (!items.length) return "0 of 0";
  const safePage = Math.min(Math.max(page, 1), getPageCount(items, pageSize));
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, items.length);
  return `${start}-${end} of ${items.length}`;
}
