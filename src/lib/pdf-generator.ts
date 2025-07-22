import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { loadFonts } from '@/lib/loadFonts'

export async function generatePdf(content: string): Promise<Uint8Array> {
  const fontBytes = loadFonts;
  const pdfDoc = await PDFDocument.create()

  const pdfBytes = await pdfDoc.save()

  return new Uint8Array();
}
