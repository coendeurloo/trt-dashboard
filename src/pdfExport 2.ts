import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export const exportElementToPdf = async (element: HTMLElement, fileName: string): Promise<void> => {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#020617"
  });

  const imageData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  let currentOffset = 0;
  pdf.addImage(imageData, "PNG", 0, currentOffset, imageWidth, imageHeight, undefined, "FAST");
  let remainingHeight = imageHeight - pageHeight;

  while (remainingHeight > 0) {
    currentOffset = remainingHeight - imageHeight;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", 0, currentOffset, imageWidth, imageHeight, undefined, "FAST");
    remainingHeight -= pageHeight;
  }

  pdf.save(fileName);
};
