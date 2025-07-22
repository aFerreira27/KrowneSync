import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import loadFonts from '@/lib/loadFonts'

export async function generatePdf(content: string): Promise<Uint8Array> {
  // const fontBytes = loadFonts;
  const pdfDoc = await PDFDocument.create()
  // pdfDoc.registerFontkit(fontkit)
  // const customFont = await pdfDoc.embedFont(fontBytes)
  const page = pdfDoc.addPage([350, 400]);
  page.moveTo(110, 200);
  page.drawText('Hello World!');
  const pdfBytes = await pdfDoc.save()

  return pdfBytes;
}
