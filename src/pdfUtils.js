// src/pdfUtils.js
import jsPDF from "jspdf";
import "jspdf-autotable";

/**
 * Generates the "Counts Needed" PDF in two columns.
 * - Vertical fill: top→bottom in left column, then right column
 * - Monochrome, font size 8
 * - Header: Counts Needed – Date – User
 * - Footer: Page X of Y (centered)
 */
export function generateMissingCountsPDF(missing = [], currentUser = "Unknown") {
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });

  const margin = { top: 25, right: 12, bottom: 20, left: 12 };
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableW = pageWidth - margin.left - margin.right;
  const colW = usableW / 4; // 4 table columns: SKU | Count | SKU | Count

  // Build SKUs array
  const skus = (missing || [])
    .map((e) => (e && e.sku != null ? String(e.sku) : ""))
    .filter((s) => s !== "");
  const half = Math.ceil(skus.length / 2);
  const left = skus.slice(0, half);
  const right = skus.slice(half);

  // Combine rows
  const body = [];
  for (let i = 0; i < half; i++) {
    body.push([left[i] ?? "", "", right[i] ?? "", ""]);
  }

  // Date string
  const dateStr = new Date().toLocaleDateString();

  // Total pages placeholder
  const totalPagesExp = "{total_pages_count_string}";

  doc.autoTable({
    head: [["SKU", "Count", "SKU", "Count"]],
    body,
    startY: margin.top,
    theme: "grid",
    margin,
    styles: {
      halign: "center",
      valign: "middle",
      fontSize: 8,
      lineWidth: 0.3,
      cellPadding: 2,
      textColor: [0, 0, 0], // black only
    },
    headStyles: {
      halign: "center",
      valign: "middle",
      fontSize: 8,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255], // white header
      lineWidth: 0.4,
    },
    columnStyles: {
      0: { cellWidth: colW },
      1: { cellWidth: colW },
      2: { cellWidth: colW },
      3: { cellWidth: colW },
    },
    didDrawPage: (data) => {
      // Use Helvetica to ensure centered text aligns correctly
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      // Header
      doc.text(
        `Counts Needed – ${dateStr} – User: ${currentUser}`,
        pageWidth / 2,
        12,
        { align: "center" }
      );

      // Footer
      const pageStr = `Page ${data.pageNumber} of ${totalPagesExp}`;
      doc.text(pageStr, pageWidth / 2, pageHeight - 8, { align: "center" });
    },
  });

  doc.putTotalPages(totalPagesExp);
  doc.save(`Counts_Needed_${Date.now()}.pdf`);
}
